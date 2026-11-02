"""Source-preserving Wan VAE units with explicit, job-owned temporal histories.

The vendor source is not modified. A host evaluates causal and spatial units
one feature frame at a time; only a temporal downsampler receives two frames.
This bounds the active WASM working set without dividing the spatial image.
"""
from dataclasses import dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F


def native_frame_contract(frames):
    if not isinstance(frames, int) or isinstance(frames, bool) or frames < 1:
        raise ValueError('Source frame count must be a positive integer')
    latent = 1 + (frames - 1) // 4
    consumed = 1 + 4 * (latent - 1)
    return {'sourceFrames': frames, 'latentFrames': latent,
            'consumedFrames': consumed, 'ignoredTailFrames': frames - consumed,
            'decodedFrames': consumed,
            'tailRule': 'native-floor-complete-groups-of-four-after-first-frame'}


class Unit(nn.Module):
    def __init__(self, module, kind, channels_in, channels_out, pre=None):
        super().__init__()
        self.module = module
        self.pre = nn.Identity() if pre is None else pre
        history = 1 if kind == 'temporalDown' else 2
        cached = kind in ('causal', 'temporalDown', 'temporalUp')
        self.metadata = {'kind': kind, 'channelsIn': channels_in,
                         'channelsOut': channels_out,
                         'inputFrames': 2 if kind == 'temporalDown' else 1,
                         'inputNames': ['input', 'history'] if cached else ['input'],
                         'outputNames': ['output', 'historyOutput'] if cached else ['output']}
        if cached:
            self.metadata['historyFrames'] = history

    def forward(self, input, history=None):
        kind = self.metadata['kind']
        if kind == 'causal':
            x = self.pre(input)
            joined = torch.cat([history, x], 2)
            return self._causal_joined(joined), joined[:, :, -2:].clone()
        if kind == 'temporalDown':
            return self.module(torch.cat([history, input], 2)), input[:, :, -1:].clone()
        if kind == 'temporalUp':
            joined = torch.cat([history, input], 2)
            x = self._causal_joined(joined)
            b, c, t, h, w = input.shape
            x = x.reshape(b, 2, c, t, h, w)
            x = torch.stack((x[:, 0], x[:, 1]), 3).reshape(b, c, t * 2, h, w)
            return x, joined[:, :, -2:].clone()
        return self.module(input)

    def _causal_joined(self, joined):
        # Exactly CausalConv3d.forward with its two-frame history already joined.
        # Share that concatenation with historyOutput instead of retaining a
        # second full joined tensor merely to return the updated cache.
        padding = list(self.module._padding)
        padding[4] -= 2
        padded = F.pad(joined, padding)
        return nn.Conv3d.forward(self.module, padded)

    def example_inputs(self, height=16, width=16):
        meta = self.metadata
        shape = ([1, meta['channelsIn'], height, width] if meta['kind'] == 'spatial'
                 else [1, meta['channelsIn'], meta['inputFrames'], height, width])
        args = [torch.zeros(shape, dtype=torch.float32)]
        if 'historyFrames' in meta:
            args.append(torch.zeros([1, meta['channelsIn'], meta['historyFrames'], height, width],
                                    dtype=torch.float32))
        return tuple(args)


class ResidualAdd(nn.Module):
    metadata = {'kind': 'add', 'inputNames': ['input', 'shortcut'],
                'outputNames': ['output'], 'inputFrames': 1}

    def forward(self, input, shortcut):
        return input + shortcut

    def example_inputs(self, height=16, width=16):
        return (torch.zeros(1, 1, 1, height, width),
                torch.zeros(1, 1, 1, height, width))


@dataclass
class Program:
    model: nn.Module
    units: dict
    programs: dict

    def _unit(self, name, x, state):
        unit = self.units[name]
        meta = unit.metadata
        if meta['kind'] == 'spatial':
            return torch.cat([unit(frame[:, :, 0]).unsqueeze(2)
                              for frame in x.split(1, 2)], 2)
        outputs = []
        for current in x.split(meta['inputFrames'], 2):
            if current.shape[2] != meta['inputFrames']:
                raise ValueError('Incomplete temporal downsampling group')
            if 'historyFrames' in meta:
                history = state.get(name)
                if history is None:
                    history = current.new_zeros(1, meta['channelsIn'], meta['historyFrames'],
                                                current.shape[3], current.shape[4])
                output, state[name] = unit(current, history)
            else:
                output = unit(current)
            outputs.append(output)
        return torch.cat(outputs, 2)

    def _execute(self, steps, x, state, first):
        for step in steps:
            op = step['op']
            if op == 'unit':
                x = self._unit(step['asset'], x, state)
            elif op == 'residual':
                shortcut = self._execute(step['shortcut'], x, state, first)
                x = self.units['residualAdd'](self._execute(step['body'], x, state, first), shortcut)
            elif op == 'resample':
                mode = step['mode']
                if mode == 'upsample3d':
                    if first:
                        # Native 'Rep' discards the first feature input. Zero history
                        # exactly represents its next-call temporal zero padding.
                        state[step['temporal']] = x.new_zeros(1, x.shape[1], 2,
                                                             x.shape[3], x.shape[4])
                    else:
                        x = self._unit(step['temporal'], x, state)
                x = self._unit(step['spatial'], x, state)
                if mode == 'downsample3d':
                    if first:
                        state[step['temporal']] = x[:, :, -1:].clone()
                    else:
                        x = self._unit(step['temporal'], x, state)
            elif op == 'mean':
                x = x[:, :step['channels']]
            else:
                raise ValueError('Unknown VAE program operation: ' + str(op))
        return x

    @staticmethod
    def _shape(x, channels):
        if x.ndim != 5 or x.shape[0] != 1 or x.shape[1] != channels:
            raise ValueError('Expected batch-one NCTHW tensor')

    def encode(self, video):
        self._shape(video, 3)
        contract = native_frame_contract(video.shape[2])
        state, outputs = {}, []
        for index in range(contract['latentFrames']):
            chunk = video[:, :, :1] if index == 0 else video[:, :, 1+4*(index-1):1+4*index]
            outputs.append(self._execute(self.programs['encode'], chunk, state, index == 0))
        return torch.cat(outputs, 2)

    def decode_body(self, projected):
        self._shape(projected, 16)
        state, outputs = {}, []
        for index, chunk in enumerate(projected.split(1, 2)):
            outputs.append(self._execute(self.programs['decode'], chunk, state, index == 0))
        return torch.cat(outputs, 2)

    def decode(self, raw):
        self._shape(raw, 16)
        return self.decode_body(self.model.conv2(raw))


def build_program(model):
    """Build an ordered program whose units retain the original learned tensors."""
    from vae import AttentionBlock, CausalConv3d, ResidualBlock, Resample
    units = {'residualAdd': ResidualAdd().eval()}

    def unit(name, module, kind, channels_in, channels_out, pre=None):
        units[name] = Unit(module, kind, channels_in, channels_out, pre).eval()
        node = {'op': 'unit', 'asset': name, 'kind': kind,
                'channelsIn': channels_in, 'channelsOut': channels_out}
        if 'historyFrames' in units[name].metadata:
            node['cache'] = name
        return node

    def conv(name, module, pre=None):
        return unit(name, module, 'causal' if module.kernel_size[0] > 1 else 'pointwise',
                    module.in_channels, module.out_channels, pre)

    def residual(name, module):
        shortcut = [] if isinstance(module.shortcut, nn.Identity) else [conv(name+'.shortcut', module.shortcut)]
        layers = module.residual
        body = [conv(name+'.residual.2', layers[2], nn.Sequential(layers[0], layers[1])),
                conv(name+'.residual.6', layers[6], nn.Sequential(layers[3], layers[4], layers[5]))]
        return {'op': 'residual', 'shortcut': shortcut, 'body': body}

    def block(name, module):
        if isinstance(module, ResidualBlock):
            return residual(name, module)
        if isinstance(module, AttentionBlock):
            return unit(name, module, 'attention', module.dim, module.dim)
        if isinstance(module, Resample):
            spatial = name+'.spatial'
            spatial_out = module.dim//2 if module.mode.startswith('up') else module.dim
            unit(spatial, module.resample, 'spatial', module.dim, spatial_out)
            node = {'op': 'resample', 'mode': module.mode, 'spatial': spatial}
            if module.mode.endswith('3d'):
                temporal = name+'.temporal'
                kind = 'temporalUp' if module.mode.startswith('up') else 'temporalDown'
                unit(temporal, module.time_conv, kind, module.dim, module.dim)
                node.update(temporal=temporal, cache=temporal)
            return node
        raise TypeError('Unsupported source VAE block: '+type(module).__name__)

    def core(name, module, stages):
        steps = [conv(name+'.conv1', module.conv1)]
        if name == 'decoder':
            steps += [block(name+'.middle.'+str(i), m) for i, m in enumerate(module.middle)]
        steps += [block(name+'.'+stages+'.'+str(i), m)
                  for i, m in enumerate(getattr(module, stages))]
        if name == 'encoder':
            steps += [block(name+'.middle.'+str(i), m) for i, m in enumerate(module.middle)]
        steps.append(conv(name+'.head.2', module.head[2], nn.Sequential(module.head[0], module.head[1])))
        return steps

    encode = core('encoder', model.encoder, 'downsamples')
    encode += [conv('conv1', model.conv1), {'op': 'mean', 'channels': model.z_dim}]
    decode = core('decoder', model.decoder, 'upsamples')
    return Program(model, units, {'encode': encode, 'decode': decode})

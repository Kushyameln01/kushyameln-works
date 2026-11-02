"""Source equivalence checks for the partitioned, explicit-state VAE program."""
import importlib.util
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent
sys.path[:0] = [str(ROOT), str(ROOT / 'vendor')]


class StreamProgramTests(unittest.TestCase):
    def test_native_tail_contract_does_not_invent_missing_frames(self):
        spec = importlib.util.find_spec('stream_program')
        self.assertIsNotNone(spec, 'The explicit-state stream program is missing')
        from stream_program import native_frame_contract
        expected = {1: (1, 1, 0), 4: (1, 1, 3), 5: (2, 5, 0),
                    80: (20, 77, 3), 81: (21, 81, 0)}
        for frames, (latent, consumed, tail) in expected.items():
            contract = native_frame_contract(frames)
            self.assertEqual((contract['latentFrames'], contract['consumedFrames'],
                              contract['ignoredTailFrames']), (latent, consumed, tail))
            self.assertEqual(contract['decodedFrames'], consumed)

    def test_partitioned_operations_match_unchanged_source(self):
        import torch
        from vae import WanVAE_
        from stream_program import build_program
        torch.set_num_threads(1)
        torch.manual_seed(1701)
        model = WanVAE_(dim=4, z_dim=16, dim_mult=[1, 2, 4, 4],
                        num_res_blocks=2, attn_scales=[],
                        temperal_downsample=[False, True, True], dropout=0.).eval()
        self.assertEqual(len(model.state_dict()), 194)
        program = build_program(model)
        with torch.inference_mode():
            for frames in (1, 4, 5, 9):
                video = torch.linspace(-1, 1, 3 * frames * 16 * 16).reshape(1, 3, frames, 16, 16)
                expected = model.encode(video, [0., 1.])
                actual = program.encode(video)
                torch.testing.assert_close(actual, expected, atol=2e-5, rtol=2e-5)
                # Independent raw latent, rather than the encoded posterior mean.
                raw = torch.linspace(-.25, .25, expected.numel()).reshape(expected.shape)
                torch.testing.assert_close(program.decode(raw), model.decode(raw, [0., 1.]),
                                           atol=2e-5, rtol=2e-5)
            # Repeated shapes and jobs must start with fresh temporal histories.
            still = torch.zeros(1, 3, 1, 16, 32)
            torch.testing.assert_close(program.encode(still), model.encode(still, [0., 1.]),
                                       atol=2e-5, rtol=2e-5)


if __name__ == '__main__':
    unittest.main()

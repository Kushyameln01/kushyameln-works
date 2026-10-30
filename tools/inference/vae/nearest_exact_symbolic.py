"""Explicit fixed-scale ONNX lowering of official nearest-exact operation.

Only fixed integer 2x upsampling used by this VAE proof is supported. Original
PyTorch reference/source is unchanged. ONNX half_pixel + round_prefer_floor
matches PyTorch nearest-exact center-coordinate nearest sampling, including ties.
"""
import torch
from torch.onnx import symbolic_helper

def lower(g,x,output_size,scale_factors):
 scales=symbolic_helper._maybe_get_const(scale_factors,'fs')
 if scales != [2.0,2.0]:raise ValueError('Only exact 2x VAE upsampling validated')
 return g.op('Resize',x,g.op('Constant',value_t=torch.tensor([],dtype=torch.float32)),g.op('Constant',value_t=torch.tensor([1.,1.,2.,2.],dtype=torch.float32)),mode_s='nearest',coordinate_transformation_mode_s='half_pixel',nearest_mode_s='round_prefer_floor')

def register():torch.onnx.register_custom_op_symbolic('aten::_upsample_nearest_exact2d',lower,17)

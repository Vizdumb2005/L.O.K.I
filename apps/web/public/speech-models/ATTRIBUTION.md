# Model artifacts in this directory

## segmentation-3-0.int8.onnx
- Model: pyannote/segmentation-3.0, converted to ONNX (int8) by the k2-fsa
  sherpa-onnx project.
- License: MIT (see segmentation-3-0.LICENSE.txt, shipped by upstream).
- Sources: https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-segmentation-models
  (upstream model card: https://huggingface.co/pyannote/segmentation-3.0, MIT, gated)

## wespeaker-resnet34-lm.onnx
- Model: WeSpeaker ResNet34 (length-normalized), trained on VoxCeleb (English),
  converted to ONNX by the k2-fsa sherpa-onnx project.
- License: per WeSpeaker's published policy, pretrained weights follow the
  license of their training dataset; VoxCeleb is Creative Commons
  Attribution 4.0 International (CC BY 4.0):
  https://wenet-e2e.github.io/wespeaker/pretrained.html ,
  https://mm.kaist.ac.kr/datasets/voxceleb/
- Attribution (required by CC BY 4.0): WeSpeaker project (wenet-e2e),
  https://github.com/wenet-e2e/wespeaker ; VoxCeleb dataset, University of
  Oxford VGG; ONNX conversion: k2-fsa sherpa-onnx,
  https://github.com/k2-fsa/sherpa-onnx/releases/tag/speaker-recongition-models
- Changes: converted to ONNX (int8 not applied); no weight changes.

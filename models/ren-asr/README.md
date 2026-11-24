# Ren English dictation model

These are the quantized encoder and joiner, float decoder, and tokens from
`sherpa-onnx-streaming-zipformer-en-20M-2023-02-17`, published by the
[sherpa-onnx ASR project](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-transducer/zipformer-transducer-models.html#csukuangfj-sherpa-onnx-streaming-zipformer-en-20m-2023-02-17-english).
The [upstream model card](https://huggingface.co/desh2608/icefall-asr-librispeech-pruned-transducer-stateless7-streaming-small)
lists Apache License 2.0. Ren's transcription runs locally and currently
supports English. Recognition quality varies with microphone, noise, accent,
and technical vocabulary; learners can always type a question instead.

The speech fixture in `test/fixtures/english.wav` comes from the model
publisher's `test_wavs/0.wav` in the same release archive.

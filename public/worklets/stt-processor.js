class SttProcessor extends AudioWorkletProcessor {
  /**
   * AudioWorkletProcessor for capturing raw PCM audio samples.
   * This runs on a dedicated audio thread to ensure glitch-free capture.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  process(inputs, _outputs, _parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      // Send the first channel of the first input to the main thread.
      // We pass the raw Float32Array directly.
      this.port.postMessage(input[0]);
    }
    // Returning true keeps the processor alive and running.
    return true;
  }
}

registerProcessor('stt-processor', SttProcessor);

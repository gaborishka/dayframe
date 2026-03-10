"""vLLM serving configuration for DayFrame private model."""

VLLM_SERVE_ARGS = {
    "model": "Qwen/Qwen3-8B",
    "enable_lora": True,
    "lora_modules": "dayframe-adapter=./final_adapter",
    "max_model_len": 4096,
    "dtype": "bfloat16",
    "gpu_memory_utilization": 0.85,
    "host": "0.0.0.0",
    "port": 8000,
    "api_key": "${PRIVATE_MODEL_API_KEY}",
    "enforce_eager": True,
}

def build_vllm_command(adapter_path: str = "./final_adapter", port: int = 8000) -> str:
    return (
        f"vllm serve Qwen/Qwen3-8B "
        f"--enable-lora "
        f"--lora-modules dayframe-adapter={adapter_path} "
        f"--max-model-len 4096 "
        f"--dtype bfloat16 "
        f"--gpu-memory-utilization 0.85 "
        f"--host 0.0.0.0 "
        f"--port {port} "
        f"--enforce-eager"
    )

def build_inference_payload(messages: list[dict], model_name: str = "dayframe-adapter") -> dict:
    return {
        "model": model_name,
        "messages": messages,
        "max_tokens": 4096,
        "temperature": 0.3,
        "top_p": 0.9,
        "extra_body": {"chat_template_kwargs": {"enable_thinking": False}},
    }

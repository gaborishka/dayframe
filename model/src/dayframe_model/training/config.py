"""QLoRA and SFT training configuration for DayFrame v1."""
from dataclasses import dataclass, field

@dataclass
class DayFrameTrainingConfig:
    """Canonical v1 training configuration per SPEC.md §10.8."""
    base_model: str = "Qwen/Qwen3-8B"
    lora_r: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    target_modules: list[str] = field(default_factory=lambda: [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ])
    quantization_bits: int = 4
    bnb_4bit_compute_dtype: str = "bfloat16"
    bnb_4bit_quant_type: str = "nf4"
    max_seq_length: int = 4096
    per_device_train_batch_size: int = 2
    gradient_accumulation_steps: int = 8
    num_train_epochs: int = 3
    learning_rate: float = 1.5e-4
    lr_scheduler_type: str = "cosine"
    warmup_ratio: float = 0.03
    weight_decay: float = 0.01
    save_steps: int = 100
    save_total_limit: int = 5
    eval_strategy: str = "steps"
    eval_steps: int = 50
    output_dir: str = "artifacts/training_run"
    bf16: bool = True
    gradient_checkpointing: bool = True
    logging_steps: int = 10
    seed: int = 42

def to_dict(config: DayFrameTrainingConfig) -> dict:
    import dataclasses
    return dataclasses.asdict(config)

"""DayFrame QLoRA SFT training pipeline."""
import json
import os

def load_jsonl_as_messages(path: str) -> list[dict]:
    from dayframe_model.training.formatting import format_training_example
    examples = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            ex = json.loads(line)
            messages = format_training_example(ex)
            examples.append({"messages": messages})
    return examples

def run_training(
    train_path: str,
    val_path: str,
    output_dir: str,
    config_overrides: dict | None = None,
):
    import torch
    from datasets import Dataset
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from trl import SFTConfig, SFTTrainer
    from dayframe_model.training.config import DayFrameTrainingConfig, to_dict

    cfg = DayFrameTrainingConfig()
    if config_overrides:
        for k, v in config_overrides.items():
            if hasattr(cfg, k):
                setattr(cfg, k, v)
    cfg.output_dir = output_dir

    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, "training_config.json"), "w") as f:
        json.dump(to_dict(cfg), f, indent=2)

    train_data = Dataset.from_list(load_jsonl_as_messages(train_path))
    val_data = Dataset.from_list(load_jsonl_as_messages(val_path))

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=getattr(torch, cfg.bnb_4bit_compute_dtype),
        bnb_4bit_quant_type=cfg.bnb_4bit_quant_type,
        bnb_4bit_use_double_quant=True,
    )

    tokenizer = AutoTokenizer.from_pretrained(cfg.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        cfg.base_model, quantization_config=bnb_config,
        device_map="auto", trust_remote_code=True,
    )
    model = prepare_model_for_kbit_training(model)

    lora_config = LoraConfig(
        r=cfg.lora_r, lora_alpha=cfg.lora_alpha, lora_dropout=cfg.lora_dropout,
        target_modules=cfg.target_modules, bias="none", task_type="CAUSAL_LM",
    )

    sft_config = SFTConfig(
        output_dir=cfg.output_dir,
        num_train_epochs=cfg.num_train_epochs,
        per_device_train_batch_size=cfg.per_device_train_batch_size,
        gradient_accumulation_steps=cfg.gradient_accumulation_steps,
        learning_rate=cfg.learning_rate,
        lr_scheduler_type=cfg.lr_scheduler_type,
        warmup_ratio=cfg.warmup_ratio,
        weight_decay=cfg.weight_decay,
        bf16=cfg.bf16,
        gradient_checkpointing=cfg.gradient_checkpointing,
        logging_steps=cfg.logging_steps,
        save_steps=cfg.save_steps,
        save_total_limit=cfg.save_total_limit,
        eval_strategy=cfg.eval_strategy,
        eval_steps=cfg.eval_steps,
        max_seq_length=cfg.max_seq_length,
        seed=cfg.seed,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
    )

    trainer = SFTTrainer(
        model=model, args=sft_config, train_dataset=train_data,
        eval_dataset=val_data, peft_config=lora_config, processing_class=tokenizer,
    )

    trainer.train()
    trainer.save_model(os.path.join(output_dir, "final_adapter"))
    tokenizer.save_pretrained(os.path.join(output_dir, "final_adapter"))
    print(f"Training complete. Adapter saved to {output_dir}/final_adapter")

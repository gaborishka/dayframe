from dayframe_model.training.config import DayFrameTrainingConfig

def test_defaults_match_spec():
    cfg = DayFrameTrainingConfig()
    assert cfg.base_model == "Qwen/Qwen3-8B"
    assert cfg.max_seq_length == 4096
    assert cfg.per_device_train_batch_size == 2
    assert cfg.gradient_accumulation_steps == 8
    assert 1e-4 <= cfg.learning_rate <= 2e-4
    assert cfg.lr_scheduler_type == "cosine"
    assert cfg.warmup_ratio == 0.03
    assert cfg.num_train_epochs == 3
    assert cfg.save_steps == 100
    assert cfg.quantization_bits == 4

def test_effective_batch_size():
    cfg = DayFrameTrainingConfig()
    effective = cfg.per_device_train_batch_size * cfg.gradient_accumulation_steps
    assert effective == 16

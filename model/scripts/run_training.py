#!/usr/bin/env python3
"""CLI entry point for DayFrame QLoRA training."""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from dayframe_model.training.train import run_training

def main():
    parser = argparse.ArgumentParser(description="Run DayFrame QLoRA fine-tuning")
    parser.add_argument("--train-path", default="data/train.jsonl")
    parser.add_argument("--val-path", default="data/val.jsonl")
    parser.add_argument("--output-dir", default="artifacts/training_run")
    parser.add_argument("--epochs", type=int, default=None)
    parser.add_argument("--learning-rate", type=float, default=None)
    args = parser.parse_args()

    overrides = {}
    if args.epochs:
        overrides["num_train_epochs"] = args.epochs
    if args.learning_rate:
        overrides["learning_rate"] = args.learning_rate

    run_training(args.train_path, args.val_path, args.output_dir, overrides or None)

if __name__ == "__main__":
    main()

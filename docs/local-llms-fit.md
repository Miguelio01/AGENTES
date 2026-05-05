
=== System Specifications ===
CPU: Apple M1 (8 cores)
Total RAM: 8.00 GB
Available RAM: 3.00 GB
Backend: Metal
GPU: Apple M1 (unified memory, 8.00 GB shared, Metal)


=== Model Compatibility Analysis ===
Found 148 compatible model(s)

╭────────────────┬───────────────────────────────────────────────┬───────────────┬─────────┬───────┬────────────┬──────────┬─────────┬──────┬──────────┬─────────┬─────────────╮
│ Status         │ Model                                         │ Provider      │ Size    │ Score │ tok/s est. │ Quant    │ Runtime │ Mode │ Mem %    │ Context │ Added to HF │
├────────────────┼───────────────────────────────────────────────┼───────────────┼─────────┼───────┼────────────┼──────────┼─────────┼──────┼──────────┼─────────┼─────────────┤
│ 🟢 Perfect     │ LiquidAI/LFM2-8B-A1B                          │ Liquid AI     │ 8.3B    │ 84    │ 36.3       │ mlx-4bit │ MLX     │ GPU  │ 53.8%    │ 128k    │ 2025-10-07  │
│ 🟢 Perfect     │ ibm-granite/granite-4.0-h-tiny                │ ibm-granite   │ 6.9B    │ 80    │ 49.3       │ mlx-4bit │ MLX     │ GPU  │ 45.0%    │ 131k    │ 2025-09-16  │
│ ✓ 🟢 Perfect   │ deepseek-ai/DeepSeek-R1-Distill-Qwen-7B       │ DeepSeek      │ 7.6B    │ 76    │ 9.8        │ mlx-4bit │ MLX     │ GPU  │ 64.1%    │ 131k    │ 2025-01-20  │
│ 🟠 Marginal    │ deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct   │ DeepSeek      │ 15.7B   │ 75    │ 26.1       │ Q2_K     │ MLX     │ GPU  │ 100.0%   │ 6553k   │ 2024-06-14  │
│ 🟢 Perfect     │ Qwen/Qwen2.5-Coder-7B-Instruct                │ Alibaba       │ 7.6B    │ 74    │ 9.8        │ mlx-4bit │ MLX     │ GPU  │ 64.1%    │ 32k     │ 2024-09-17  │
│ 🟢 Perfect     │ bigcode/starcoder2-7b                         │ BigCode       │ 7.2B    │ 74    │ 10.4       │ mlx-4bit │ MLX     │ GPU  │ 61.8%    │ 16k     │ 2024-02-20  │
│ 🟢 Perfect     │ nomic-ai/nomic-embed-text-v1.5                │ Nomic         │ 137M    │ 72    │ 273.5      │ mlx-8bit │ MLX     │ GPU  │ 8.8%     │ 2k      │ 2024-02-10  │
│ 🟢 Perfect     │ google/gemma-3n-E4B-it                        │ Google        │ 8B      │ 71    │ 9.4        │ mlx-4bit │ MLX     │ GPU  │ 67.8%    │ 131k    │ 2025-06-25  │
│ 🟢 Perfect     │ microsoft/Phi-4-mini-reasoning                │ Microsoft     │ 3.8B    │ 69    │ 9.8        │ mlx-8bit │ MLX     │ GPU  │ 56.9%    │ 16k     │ 2025-04-01  │
│ 🟠 Marginal    │ google/gemma-3-12b-it                         │ Google        │ 12B     │ 68    │ 6.2        │ mlx-4bit │ MLX     │ GPU  │ 98.6%    │ 131k    │ —           │
│ 🟢 Perfect     │ LiquidAI/LFM2.5-1.2B-Instruct                 │ Liquid AI     │ 1.2B    │ 68    │ 32.0       │ mlx-8bit │ MLX     │ GPU  │ 24.0%    │ 128k    │ 2026-01-06  │
│ 🟠 Marginal    │ microsoft/Orca-2-13b                          │ Microsoft     │ 13.0B   │ 67    │ 5.7        │ mlx-4bit │ MLX     │ GPU  │ 98.4%    │ 4k      │ —           │
│ 🟢 Perfect     │ TinyLlama/TinyLlama-1.1B-Chat-v1.0            │ Community     │ 1.1B    │ 67    │ 34.0       │ mlx-8bit │ MLX     │ GPU  │ 20.5%    │ 2k      │ 2023-12-30  │
│ 🟢 Perfect     │ Qwen/Qwen3-0.6B                               │ Alibaba       │ 752M    │ 67    │ 49.8       │ mlx-8bit │ MLX     │ GPU  │ 26.6%    │ 40k     │ 2025-04-27  │
│ 🟠 Marginal    │ Qwen/Qwen2.5-Coder-14B-Instruct               │ Alibaba       │ 14.8B   │ 67    │ 10.1       │ Q2_K     │ MLX     │ GPU  │ 93.3%    │ 32k     │ 2024-11-06  │
│ 🟢 Perfect     │ LiquidAI/LFM2-1.2B                            │ Liquid AI     │ 1.2B    │ 66    │ 32.0       │ mlx-8bit │ MLX     │ GPU  │ 24.0%    │ 128k    │ 2025-07-10  │
│ 🟢 Perfect     │ LiquidAI/LFM2.5-1.2B-Base                     │ Liquid AI     │ 1.2B    │ 66    │ 32.0       │ mlx-8bit │ MLX     │ GPU  │ 24.0%    │ 128k    │ 2026-01-05  │
│ 🟢 Perfect     │ LiquidAI/LFM2.5-1.2B-Thinking                 │ Liquid AI     │ 1.2B    │ 66    │ 32.0       │ mlx-8bit │ MLX     │ GPU  │ 24.0%    │ 128k    │ 2026-01-20  │
│ 🟢 Perfect     │ LiquidAI/LFM2.5-1.2B-JP                       │ Liquid AI     │ 1.2B    │ 66    │ 32.0       │ mlx-8bit │ MLX     │ GPU  │ 24.0%    │ 128k    │ 2026-01-04  │
│ 🟢 Perfect     │ LiquidAI/LFM2-1.2B-Tool                       │ Liquid AI     │ 1.2B    │ 66    │ 32.0       │ mlx-8bit │ MLX     │ GPU  │ 24.0%    │ 128k    │ 2025-09-03  │
│ 🟢 Perfect     │ LiquidAI/LFM2-1.2B-RAG                        │ Liquid AI     │ 1.2B    │ 66    │ 32.0       │ mlx-8bit │ MLX     │ GPU  │ 24.0%    │ 128k    │ 2025-09-03  │
│ 🟢 Perfect     │ LiquidAI/LFM2-1.2B-Extract                    │ Liquid AI     │ 1.2B    │ 66    │ 32.0       │ mlx-8bit │ MLX     │ GPU  │ 24.0%    │ 128k    │ 2025-08-22  │
│ 🟢 Perfect     │ Qwen/Qwen2.5-Coder-1.5B-Instruct              │ Alibaba       │ 1.5B    │ 66    │ 24.2       │ mlx-8bit │ MLX     │ GPU  │ 28.3%    │ 32k     │ 2024-09-18  │
│ 🟡 Good        │ microsoft/phi-4                               │ Microsoft     │ 14B     │ 66    │ 10.7       │ Q2_K     │ MLX     │ GPU  │ 82.5%    │ 16k     │ —           │
│ 🟡 Good        │ microsoft/Phi-4-reasoning                     │ Microsoft     │ 14B     │ 66    │ 10.7       │ Q2_K     │ MLX     │ GPU  │ 82.5%    │ 32k     │ 2025-04-01  │
│ 🟠 Marginal    │ bigcode/starcoder2-15b                        │ BigCode       │ 15.7B   │ 66    │ 9.5        │ Q2_K     │ MLX     │ GPU  │ 91.7%    │ 16k     │ —           │
│ 🟢 Perfect     │ Qwen/Qwen3.5-0.8B                             │ Alibaba       │ 873M    │ 66    │ 42.8       │ mlx-8bit │ MLX     │ GPU  │ 17.9%    │ 262k    │ 2026-02-28  │
│ 🟢 Perfect     │ Qwen/Qwen3.5-0.8B-Base                        │ Alibaba       │ 873M    │ 66    │ 42.8       │ mlx-8bit │ MLX     │ GPU  │ 17.9%    │ 262k    │ 2026-02-28  │
│ ✓ 🟢 Perfect   │ meta-llama/Llama-3.2-1B                       │ Meta          │ 1.2B    │ 66    │ 30.3       │ mlx-8bit │ MLX     │ GPU  │ 22.2%    │ 4k      │ 2024-09-18  │
│ 🟠 Marginal    │ WizardLMTeam/WizardCoder-15B-V1.0             │ WizardLM      │ 15.5B   │ 65    │ 9.6        │ Q2_K     │ MLX     │ GPU  │ 90.7%    │ 8k      │ —           │
│ 🟢 Perfect     │ google/gemma-3n-E2B-it                        │ Google        │ 4B      │ 65    │ 9.4        │ mlx-8bit │ MLX     │ GPU  │ 59.5%    │ 131k    │ 2025-06-25  │
│ ✓ 🟢 Perfect   │ meta-llama/Llama-3.1-8B                       │ Meta          │ 8.0B    │ 65    │ 9.3        │ mlx-4bit │ MLX     │ GPU  │ 64.7%    │ 4k      │ 2024-07-14  │
│ 🟢 Perfect     │ LiquidAI/LFM2-700M                            │ Liquid AI     │ 742M    │ 65    │ 50.4       │ mlx-8bit │ MLX     │ GPU  │ 18.7%    │ 128k    │ 2025-07-10  │
│ 🟢 Perfect     │ HuggingFaceH4/zephyr-7b-beta                  │ HuggingFace   │ 7.2B    │ 65    │ 10.3       │ mlx-4bit │ MLX     │ GPU  │ 68.5%    │ 32k     │ 2023-10-26  │
│ 🟢 Perfect     │ Qwen/Qwen3-8B                                 │ Alibaba       │ 8.2B    │ 65    │ 9.1        │ mlx-4bit │ MLX     │ GPU  │ 76.6%    │ 40k     │ 2025-04-27  │
│ 🟢 Perfect     │ LGAI-EXAONE/EXAONE-4.0-1.2B                   │ lgai-exaone   │ 1.3B    │ 64    │ 29.2       │ mlx-8bit │ MLX     │ GPU  │ 28.1%    │ 1048k   │ 2025-07-11  │
│ 🟢 Perfect     │ google/gemma-4-E4B-it                         │ Google        │ 8.0B    │ 64    │ 9.4        │ mlx-4bit │ MLX     │ GPU  │ 67.8%    │ 131k    │ 2026-03-02  │
│ 🟢 Perfect     │ LiquidAI/LFM2-ColBERT-350M                    │ Liquid AI     │ 353M    │ 64    │ 105.9      │ mlx-8bit │ MLX     │ GPU  │ 13.8%    │ 128k    │ 2025-10-28  │
│ 🟢 Perfect     │ LiquidAI/LFM2-350M                            │ Liquid AI     │ 354M    │ 64    │ 105.5      │ mlx-8bit │ MLX     │ GPU  │ 13.8%    │ 128k    │ 2025-07-10  │
│ 🟢 Perfect     │ LiquidAI/LFM2-350M-Extract                    │ Liquid AI     │ 354M    │ 64    │ 105.5      │ mlx-8bit │ MLX     │ GPU  │ 13.8%    │ 128k    │ 2025-09-03  │
│ 🟢 Perfect     │ LiquidAI/LFM2-350M-Math                       │ Liquid AI     │ 354M    │ 64    │ 105.5      │ mlx-8bit │ MLX     │ GPU  │ 13.8%    │ 128k    │ 2025-08-25  │
│ 🟢 Perfect     │ LiquidAI/LFM2-350M-ENJP-MT                    │ Liquid AI     │ 354M    │ 64    │ 105.5      │ mlx-8bit │ MLX     │ GPU  │ 13.8%    │ 128k    │ 2025-09-03  │
│ 🟢 Perfect     │ LiquidAI/LFM2-350M-PII-Extract-JP             │ Liquid AI     │ 354M    │ 64    │ 105.5      │ mlx-8bit │ MLX     │ GPU  │ 13.8%    │ 128k    │ 2025-09-30  │
│ 🟢 Perfect     │ LiquidAI/LFM2-VL-450M                         │ Liquid AI     │ 451M    │ 64    │ 83.0       │ mlx-8bit │ MLX     │ GPU  │ 12.3%    │ 128k    │ 2025-08-12  │
│ 🟠 Marginal    │ meta-llama/CodeLlama-13b-Instruct-hf          │ Meta          │ 13.0B   │ 64    │ 5.7        │ mlx-4bit │ MLX     │ GPU  │ 98.4%    │ 4k      │ 2024-03-13  │
│ 🟡 Good        │ google/gemma-2-9b-it                          │ Google        │ 9.2B    │ 64    │ 8.1        │ mlx-4bit │ MLX     │ GPU  │ 73.6%    │ 4k      │ 2024-06-24  │
│ 🟢 Perfect     │ google/gemma-3-1b-it                          │ Google        │ 1000M   │ 63    │ 37.4       │ mlx-8bit │ MLX     │ GPU  │ 19.2%    │ 4k      │ 2025-03-10  │
│ 🟢 Perfect     │ mistralai/Mistral-7B-Instruct-v0.3            │ Mistral AI    │ 7.2B    │ 63    │ 10.3       │ mlx-4bit │ MLX     │ GPU  │ 68.6%    │ 32k     │ 2024-05-22  │
│ 🟢 Perfect     │ Qwen/Qwen2.5-7B-Instruct                      │ Alibaba       │ 7.6B    │ 63    │ 9.8        │ mlx-4bit │ MLX     │ GPU  │ 64.1%    │ 32k     │ 2024-09-16  │
│ 🟢 Perfect     │ XiaomiMiMo/MiMo-7B-RL                         │ Xiaomi        │ 7.0B    │ 63    │ 5.3        │ mlx-8bit │ MLX     │ GPU  │ 99.5%    │ 32k     │ 2025-05-01  │
│ 🟢 Perfect     │ microsoft/Orca-2-7b                           │ Microsoft     │ 7.0B    │ 62    │ 5.3        │ mlx-8bit │ MLX     │ GPU  │ 96.8%    │ 4k      │ —           │
│ ✓ 🟢 Perfect   │ meta-llama/Llama-3.1-8B-Instruct              │ Meta          │ 8.0B    │ 62    │ 9.3        │ mlx-4bit │ MLX     │ GPU  │ 64.7%    │ 4k      │ 2024-07-18  │
│ 🟢 Perfect     │ tiiuae/Falcon3-7B-Instruct                    │ TII           │ 7.5B    │ 62    │ 10.0       │ mlx-4bit │ MLX     │ GPU  │ 68.4%    │ 32k     │ 2024-11-29  │
│ 🟢 Perfect     │ Qwen/Qwen2.5-VL-7B-Instruct                   │ Alibaba       │ 8.3B    │ 62    │ 9.0        │ mlx-4bit │ MLX     │ GPU  │ 68.7%    │ 128k    │ 2025-01-26  │
│ 🟢 Perfect     │ mistralai/Ministral-8B-Instruct-2410          │ Mistral AI    │ 8.0B    │ 62    │ 9.3        │ mlx-4bit │ MLX     │ GPU  │ 68.0%    │ 32k     │ —           │
│ 🟢 Perfect     │ LiquidAI/LFM2-Audio-1.5B                      │ Liquid AI     │ 1.5B    │ 61    │ 25.4       │ mlx-8bit │ MLX     │ GPU  │ 25.2%    │ 4k      │ 2025-08-28  │
│ 🟢 Perfect     │ LiquidAI/LFM2.5-Audio-1.5B                    │ Liquid AI     │ 1.5B    │ 61    │ 25.4       │ mlx-8bit │ MLX     │ GPU  │ 25.2%    │ 4k      │ 2025-12-18  │
│ ✓ 🟢 Perfect   │ meta-llama/Llama-3.2-3B                       │ Meta          │ 3.2B    │ 61    │ 11.6       │ mlx-8bit │ MLX     │ GPU  │ 47.7%    │ 4k      │ 2024-09-18  │
│ 🟢 Perfect     │ stabilityai/stablelm-2-1_6b-chat              │ Stability AI  │ 1.6B    │ 61    │ 22.7       │ mlx-8bit │ MLX     │ GPU  │ 36.2%    │ 4k      │ 2024-04-08  │
│ 🟢 Perfect     │ HuggingFaceTB/SmolLM3-3B                      │ huggingfacetb │ 3.1B    │ 61    │ 12.2       │ mlx-8bit │ MLX     │ GPU  │ 51.7%    │ 65k     │ 2025-07-08  │
│ 🟢 Perfect     │ ibm-granite/granite-4.0-h-micro               │ ibm-granite   │ 3.2B    │ 61    │ 11.7       │ mlx-8bit │ MLX     │ GPU  │ 54.0%    │ 131k    │ 2025-09-16  │
│ 🟠 Marginal    │ Qwen/Qwen3-14B                                │ Alibaba       │ 14.8B   │ 60    │ 10.1       │ Q2_K     │ MLX     │ GPU  │ 86.7%    │ 131k    │ —           │
│ 🟢 Perfect     │ LiquidAI/LFM2-VL-1.6B                         │ Liquid AI     │ 1.6B    │ 60    │ 23.6       │ mlx-8bit │ MLX     │ GPU  │ 27.4%    │ 128k    │ 2025-08-12  │
│ 🟢 Perfect     │ LiquidAI/LFM2.5-VL-1.6B                       │ Liquid AI     │ 1.6B    │ 60    │ 23.4       │ mlx-8bit │ MLX     │ GPU  │ 27.5%    │ 128k    │ 2026-01-05  │
│ 🟡 Good        │ Qwen/Qwen3.5-9B                               │ Alibaba       │ 9.7B    │ 59    │ 7.7        │ mlx-4bit │ MLX     │ GPU  │ 80.5%    │ 262k    │ 2026-02-27  │
│ 🟡 Good        │ Qwen/Qwen3.5-9B-Base                          │ Alibaba       │ 9.7B    │ 59    │ 7.7        │ mlx-4bit │ MLX     │ GPU  │ 80.5%    │ 262k    │ 2026-02-26  │
│ 🟢 Perfect     │ Qwen/Qwen3-1.7B                               │ Alibaba       │ 2.0B    │ 59    │ 18.4       │ mlx-8bit │ MLX     │ GPU  │ 42.6%    │ 40k     │ 2025-04-27  │
│ 🟢 Perfect     │ Qwen/Qwen3.5-4B                               │ Alibaba       │ 4.7B    │ 59    │ 8.0        │ mlx-8bit │ MLX     │ GPU  │ 68.3%    │ 262k    │ 2026-02-27  │
│ 🟢 Perfect     │ Qwen/Qwen3.5-4B-Base                          │ Alibaba       │ 4.7B    │ 59    │ 8.0        │ mlx-8bit │ MLX     │ GPU  │ 68.3%    │ 262k    │ 2026-02-27  │
│ 🟠 Marginal    │ nvidia/NVIDIA-Nemotron-Nano-9B-v2             │ nvidia        │ 8.9B    │ 59    │ 8.4        │ mlx-4bit │ MLX     │ GPU  │ 89.2%    │ 131k    │ 2025-08-12  │
│ 🟠 Marginal    │ meta-llama/Llama-3.2-11B-Vision-Instruct      │ Meta          │ 10.7B   │ 59    │ 7.0        │ mlx-4bit │ MLX     │ GPU  │ 84.0%    │ 4k      │ 2024-09-18  │
│ 🟢 Perfect     │ Qwen/Qwen2.5-VL-3B-Instruct                   │ Alibaba       │ 3.8B    │ 58    │ 10.0       │ mlx-8bit │ MLX     │ GPU  │ 56.7%    │ 128k    │ 2025-01-26  │
│ 🟠 Marginal    │ Qwen/Qwen2.5-14B-Instruct                     │ Alibaba       │ 14.8B   │ 58    │ 10.1       │ Q2_K     │ MLX     │ GPU  │ 86.7%    │ 131k    │ —           │
│ 🟢 Perfect     │ tiiuae/falcon-7b-instruct                     │ TII           │ 7.2B    │ 58    │ 10.4       │ mlx-4bit │ MLX     │ GPU  │ 83.6%    │ 4k      │ 2023-04-25  │
│ 🟢 Perfect     │ google/gemma-4-E2B-it                         │ Google        │ 5.1B    │ 58    │ 7.3        │ mlx-8bit │ MLX     │ GPU  │ 74.5%    │ 131k    │ 2026-03-02  │
│ 🟠 Marginal    │ upstage/SOLAR-10.7B-Instruct-v1.0             │ Upstage       │ 10.7B   │ 58    │ 7.0        │ mlx-4bit │ MLX     │ GPU  │ 89.4%    │ 4k      │ 2023-12-12  │
│ 🟢 Perfect     │ microsoft/phi-3-mini-4k-instruct              │ Microsoft     │ 3.8B    │ 58    │ 9.8        │ mlx-8bit │ MLX     │ GPU  │ 72.8%    │ 4k      │ 2024-04-22  │
│ 🟢 Perfect     │ Qwen/Qwen3.5-2B                               │ Alibaba       │ 2.3B    │ 57    │ 16.4       │ mlx-8bit │ MLX     │ GPU  │ 36.5%    │ 262k    │ 2026-02-28  │
│ 🟢 Perfect     │ Qwen/Qwen3.5-2B-Base                          │ Alibaba       │ 2.3B    │ 57    │ 16.4       │ mlx-8bit │ MLX     │ GPU  │ 36.5%    │ 262k    │ 2026-02-28  │
│ 🟠 Marginal    │ microsoft/Phi-3-medium-14b-instruct           │ Microsoft     │ 14B     │ 56    │ 7.1        │ Q3_K_M   │ MLX     │ GPU  │ 96.0%    │ 4k      │ —           │
│ 🟢 Perfect     │ LiquidAI/LFM2-2.6B                            │ Liquid AI     │ 2.6B    │ 56    │ 14.6       │ mlx-8bit │ MLX     │ GPU  │ 44.2%    │ 128k    │ 2025-09-22  │
│ 🟢 Perfect     │ LiquidAI/LFM2-2.6B-Exp                        │ Liquid AI     │ 2.6B    │ 56    │ 14.6       │ mlx-8bit │ MLX     │ GPU  │ 44.2%    │ 128k    │ 2025-12-25  │
│ 🟢 Perfect     │ LiquidAI/LFM2-2.6B-Transcript                 │ Liquid AI     │ 2.6B    │ 56    │ 14.6       │ mlx-8bit │ MLX     │ GPU  │ 44.2%    │ 128k    │ 2026-01-05  │
│ 🟢 Perfect     │ google/gemma-2-2b-it                          │ Google        │ 2.6B    │ 55    │ 14.3       │ mlx-8bit │ MLX     │ GPU  │ 40.0%    │ 4k      │ 2024-07-16  │
│ 🟢 Perfect     │ BAAI/bge-large-en-v1.5                        │ BAAI          │ 335M    │ 55    │ 111.6      │ mlx-8bit │ MLX     │ GPU  │ 11.0%    │ 0k      │ 2023-09-12  │
│ 🟢 Perfect     │ meta-llama/CodeLlama-7b-Instruct-hf           │ Meta          │ 6.7B    │ 55    │ 5.6        │ mlx-8bit │ MLX     │ GPU  │ 93.2%    │ 4k      │ 2024-03-13  │
│ 🟠 Marginal    │ mistralai/Mistral-Nemo-Instruct-2407          │ Mistral AI    │ 12.2B   │ 54    │ 6.1        │ mlx-4bit │ MLX     │ GPU  │ 95.5%    │ 131k    │ —           │
│ 🟢 Perfect     │ LiquidAI/LFM2-VL-3B                           │ Liquid AI     │ 3.0B    │ 54    │ 12.5       │ mlx-8bit │ MLX     │ GPU  │ 46.2%    │ 128k    │ 2025-10-22  │
│ 🟠 Marginal    │ lmsys/vicuna-13b-v1.5                         │ LMSYS         │ 13.0B   │ 54    │ 5.7        │ mlx-4bit │ MLX     │ GPU  │ 98.4%    │ 4k      │ —           │
│ 🟠 Marginal    │ WizardLMTeam/WizardLM-13B-V1.2                │ WizardLM      │ 13.0B   │ 54    │ 5.7        │ mlx-4bit │ MLX     │ GPU  │ 98.4%    │ 4k      │ —           │
│ 🟠 Marginal    │ THUDM/glm-4-9b-chat                           │ thudm         │ 9.4B    │ 54    │ 10.6       │ Q3_K_M   │ MLX     │ GPU  │ 93.9%    │ 131k    │ 2024-06-04  │
│ 🟢 Perfect     │ openchat/openchat-3.5-0106                    │ OpenChat      │ 7.0B    │ 52    │ 5.3        │ mlx-8bit │ MLX     │ GPU  │ 99.5%    │ 8k      │ —           │
│ 🟢 Perfect     │ microsoft/Phi-4-multimodal-instruct           │ Microsoft     │ 5.6B    │ 50    │ 6.7        │ mlx-8bit │ MLX     │ GPU  │ 88.4%    │ 131k    │ 2025-02-24  │
│ 🟢 Perfect     │ microsoft/Phi-3.5-mini-instruct               │ Microsoft     │ 3.8B    │ 50    │ 9.8        │ mlx-8bit │ MLX     │ GPU  │ 91.5%    │ 131k    │ 2024-08-16  │
│ 🟢 Perfect     │ 01-ai/Yi-6B-Chat                              │ 01.ai         │ 6.1B    │ 50    │ 6.2        │ mlx-8bit │ MLX     │ GPU  │ 85.1%    │ 4k      │ 2023-11-22  │
│ 🟢 Perfect     │ lmsys/vicuna-7b-v1.5                          │ LMSYS         │ 7.0B    │ 46    │ 5.6        │ mlx-8bit │ MLX     │ GPU  │ 93.2%    │ 4k      │ —           │
│ ✓ 🔴 Too Tight │ deepseek-ai/DeepSeek-R1                       │ DeepSeek      │ 684.5B  │ 69    │ 0.7        │ Q4_K_M   │ MLX     │ GPU  │ 4382.5%  │ 6553k   │ 2025-01-20  │
│ 🔴 Too Tight   │ deepseek-ai/DeepSeek-V3.2-Speciale            │ DeepSeek      │ 685B    │ 69    │ 0.7        │ Q4_K_M   │ MLX     │ GPU  │ 4391.2%  │ 131k    │ 2025-12-01  │
│ 🔴 Too Tight   │ Qwen/Qwen3-Coder-Next                         │ Alibaba       │ 79.7B   │ 68    │ 8.6        │ Q4_K_M   │ MLX     │ GPU  │ 510.0%   │ 262k    │ 2026-01-30  │
│ 🔴 Too Tight   │ deepseek-ai/DeepSeek-R1-Distill-Qwen-32B      │ DeepSeek      │ 32.8B   │ 66    │ 2.3        │ Q4_K_M   │ MLX     │ GPU  │ 268.8%   │ 131k    │ 2025-01-20  │
│ 🔴 Too Tight   │ Qwen/Qwen3-Coder-480B-A35B-Instruct           │ Alibaba       │ 480.2B  │ 64    │ 0.7        │ Q4_K_M   │ MLX     │ GPU  │ 3073.8%  │ 262k    │ 2025-07-22  │
│ 🔴 Too Tight   │ LiquidAI/LFM2-24B-A2B                         │ Liquid AI     │ 23.8B   │ 62    │ 19.6       │ Q4_K_M   │ MLX     │ GPU  │ 152.5%   │ 128k    │ 2026-02-24  │
│ 🔴 Too Tight   │ Qwen/Qwen2.5-Coder-32B-Instruct               │ Alibaba       │ 32.8B   │ 62    │ 2.3        │ Q4_K_M   │ MLX     │ GPU  │ 268.8%   │ 32k     │ 2024-11-06  │
│ 🔴 Too Tight   │ inclusionAI/Ling-lite                         │ inclusionai   │ 16.8B   │ 61    │ 25.4       │ Q2_K     │ MLX     │ GPU  │ 107.5%   │ 32k     │ 2025-02-28  │
│ 🔴 Too Tight   │ meta-llama/CodeLlama-34b-Instruct-hf          │ Meta          │ 33.7B   │ 58    │ 2.2        │ Q4_K_M   │ MLX     │ GPU  │ 264.7%   │ 4k      │ 2024-03-14  │
│ 🔴 Too Tight   │ Qwen/Qwen3.5-35B-A3B                          │ Alibaba       │ 36.0B   │ 55    │ 8.6        │ Q4_K_M   │ MLX     │ GPU  │ 230.0%   │ 262k    │ 2026-02-24  │
│ 🔴 Too Tight   │ Qwen/Qwen3.6-35B-A3B                          │ Alibaba       │ 36.0B   │ 55    │ 8.6        │ Q4_K_M   │ MLX     │ GPU  │ 230.0%   │ 262k    │ 2026-04-15  │
│ 🔴 Too Tight   │ NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO   │ NousResearch  │ 46.7B   │ 54    │ 4.5        │ Q4_K_M   │ MLX     │ GPU  │ 298.8%   │ 32k     │ 2024-01-11  │
│ 🔴 Too Tight   │ nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16    │ nvidia        │ 31.6B   │ 54    │ 8.6        │ Q4_K_M   │ MLX     │ GPU  │ 202.5%   │ 262k    │ 2025-12-04  │
│ 🔴 Too Tight   │ Qwen/Qwen3.5-122B-A10B                        │ Alibaba       │ 125.1B  │ 53    │ 2.6        │ Q4_K_M   │ MLX     │ GPU  │ 801.2%   │ 262k    │ 2026-02-24  │
│ 🔴 Too Tight   │ deepseek-ai/DeepSeek-V4-Flash                 │ DeepSeek      │ 158.1B  │ 53    │ 2.0        │ Q4_K_M   │ MLX     │ GPU  │ 1012.5%  │ 16777k  │ 2026-04-22  │
│ 🔴 Too Tight   │ deepseek-ai/DeepSeek-V4-Flash-Base            │ DeepSeek      │ 292.0B  │ 53    │ 2.0        │ Q4_K_M   │ MLX     │ GPU  │ 1870.0%  │ 16777k  │ 2026-04-22  │
│ 🔴 Too Tight   │ google/gemma-4-26B-A4B-it                     │ Google        │ 26.5B   │ 53    │ 6.4        │ Q4_K_M   │ MLX     │ GPU  │ 170.0%   │ 262k    │ 2026-03-11  │
│ 🔴 Too Tight   │ Qwen/Qwen3.5-397B-A17B                        │ Alibaba       │ 403.4B  │ 52    │ 1.5        │ Q4_K_M   │ MLX     │ GPU  │ 2582.5%  │ 262k    │ 2026-02-16  │
│ 🔴 Too Tight   │ MiniMaxAI/MiniMax-M2.7                        │ minimaxai     │ 228.7B  │ 52    │ 2.6        │ Q4_K_M   │ MLX     │ GPU  │ 1463.8%  │ 204k    │ 2026-04-09  │
│ 🔴 Too Tight   │ MiniMaxAI/MiniMax-M2.5                        │ minimaxai     │ 228.7B  │ 52    │ 2.6        │ Q4_K_M   │ MLX     │ GPU  │ 1463.8%  │ 196k    │ 2026-02-12  │
│ 🔴 Too Tight   │ deepseek-ai/DeepSeek-V3                       │ DeepSeek      │ 684.5B  │ 52    │ 0.7        │ Q4_K_M   │ MLX     │ GPU  │ 4382.5%  │ 6553k   │ 2024-12-25  │
│ 🔴 Too Tight   │ deepseek-ai/DeepSeek-V3.2                     │ DeepSeek      │ 685.4B  │ 52    │ 0.7        │ Q4_K_M   │ MLX     │ GPU  │ 4388.8%  │ 6553k   │ 2025-12-01  │
│ 🔴 Too Tight   │ Qwen/Qwen3-235B-A22B                          │ Alibaba       │ 235.1B  │ 52    │ 1.2        │ Q4_K_M   │ MLX     │ GPU  │ 1505.0%  │ 40k     │ 2025-04-27  │
│ 🔴 Too Tight   │ deepseek-ai/DeepSeek-V4-Pro                   │ DeepSeek      │ 861.6B  │ 52    │ 0.5        │ Q4_K_M   │ MLX     │ GPU  │ 5516.2%  │ 16777k  │ 2026-04-22  │
│ 🔴 Too Tight   │ deepseek-ai/DeepSeek-V4-Pro-Base              │ DeepSeek      │ 1600.8B │ 52    │ 0.5        │ Q4_K_M   │ MLX     │ GPU  │ 10250.0% │ 16777k  │ 2026-04-22  │
│ 🔴 Too Tight   │ rednote-hilab/dots.llm1.inst                  │ rednote-hilab │ 142.8B  │ 52    │ 1.9        │ Q4_K_M   │ MLX     │ GPU  │ 913.7%   │ 32k     │ 2025-05-14  │
│ 🔴 Too Tight   │ XiaomiMiMo/MiMo-V2-Flash                      │ xiaomimimo    │ 309.8B  │ 52    │ 1.7        │ Q4_K_M   │ MLX     │ GPU  │ 1983.7%  │ 262k    │ 2025-12-16  │
│ 🔴 Too Tight   │ moonshotai/Kimi-K2.5                          │ moonshotai    │ 1058.6B │ 51    │ 0.8        │ Q4_K_M   │ MLX     │ GPU  │ 6777.5%  │ 16777k  │ 2026-01-01  │
│ 🔴 Too Tight   │ zai-org/GLM-5                                 │ zai-org       │ 753.9B  │ 51    │ 0.6        │ Q4_K_M   │ MLX     │ GPU  │ 4826.2%  │ 202k    │ 2026-02-11  │
│ 🔴 Too Tight   │ bigscience/bloom                              │ bigscience    │ 176.2B  │ 51    │ 0.4        │ Q4_K_M   │ MLX     │ GPU  │ 1356.2%  │ 4k      │ 2022-05-19  │
│ 🔴 Too Tight   │ Qwen/Qwen3.5-27B                              │ Alibaba       │ 27.8B   │ 51    │ 2.7        │ Q4_K_M   │ MLX     │ GPU  │ 230.4%   │ 262k    │ 2026-02-24  │
│ 🔴 Too Tight   │ Qwen/Qwen3.6-27B                              │ Alibaba       │ 27.8B   │ 51    │ 2.7        │ Q4_K_M   │ MLX     │ GPU  │ 230.4%   │ 262k    │ 2026-04-21  │
│ 🔴 Too Tight   │ baidu/ERNIE-4.5-300B-A47B-Paddle              │ baidu         │ 300.5B  │ 51    │ 0.2        │ Q4_K_M   │ MLX     │ GPU  │ 2205.8%  │ 131k    │ 2025-06-28  │
│ 🔴 Too Tight   │ google/gemma-2-27b-it                         │ Google        │ 27.2B   │ 50    │ 2.7        │ Q4_K_M   │ MLX     │ GPU  │ 214.8%   │ 4k      │ 2024-06-24  │
│ 🔴 Too Tight   │ google/gemma-3-27b-it                         │ Google        │ 27.4B   │ 50    │ 2.7        │ Q4_K_M   │ MLX     │ GPU  │ 216.4%   │ 4k      │ 2025-03-01  │
│ 🔴 Too Tight   │ mistralai/Mixtral-8x7B-Instruct-v0.1          │ Mistral AI    │ 46.7B   │ 50    │ 4.5        │ Q4_K_M   │ MLX     │ GPU  │ 298.8%   │ 32k     │ 2023-12-10  │
│ 🔴 Too Tight   │ google/gemma-4-31B-it                         │ Google        │ 32.7B   │ 50    │ 2.3        │ Q4_K_M   │ MLX     │ GPU  │ 270.0%   │ 262k    │ 2026-03-11  │
│ 🔴 Too Tight   │ LGAI-EXAONE/EXAONE-4.0-32B                    │ lgai-exaone   │ 32.0B   │ 50    │ 2.3        │ Q4_K_M   │ MLX     │ GPU  │ 263.3%   │ 2097k   │ 2025-07-11  │
│ 🔴 Too Tight   │ meta-llama/Llama-4-Maverick-17B-128E-Instruct │ Meta          │ 401.6B  │ 50    │ 3.2        │ Q4_K_M   │ MLX     │ GPU  │ 2571.2%  │ 4k      │ 2025-04-01  │
│ 🔴 Too Tight   │ CohereForAI/c4ai-command-r-v01                │ Cohere        │ 35B     │ 49    │ 2.1        │ Q4_K_M   │ MLX     │ GPU  │ 288.7%   │ 131k    │ —           │
│ 🔴 Too Tight   │ meta-llama/Llama-3.1-70B-Instruct             │ Meta          │ 70.6B   │ 48    │ 1.1        │ Q4_K_M   │ MLX     │ GPU  │ 546.7%   │ 4k      │ 2024-07-16  │
│ 🔴 Too Tight   │ meta-llama/Llama-3.3-70B-Instruct             │ Meta          │ 70.6B   │ 48    │ 1.1        │ Q4_K_M   │ MLX     │ GPU  │ 546.7%   │ 4k      │ 2024-11-26  │
│ 🔴 Too Tight   │ Qwen/Qwen2.5-72B-Instruct                     │ Alibaba       │ 72.7B   │ 48    │ 1.0        │ Q4_K_M   │ MLX     │ GPU  │ 564.6%   │ 32k     │ 2024-09-16  │
│ 🔴 Too Tight   │ mistralai/Mixtral-8x22B-Instruct-v0.1         │ Mistral AI    │ 140.6B  │ 48    │ 1.5        │ Q4_K_M   │ MLX     │ GPU  │ 900.0%   │ 65k     │ 2024-04-16  │
│ 🔴 Too Tight   │ meta-llama/Llama-3.1-405B-Instruct            │ Meta          │ 405.9B  │ 47    │ 0.2        │ Q4_K_M   │ MLX     │ GPU  │ 3114.9%  │ 4k      │ 2024-07-16  │
│ 🔴 Too Tight   │ mistralai/Mistral-Small-24B-Instruct-2501     │ Mistral AI    │ 24B     │ 47    │ 3.1        │ Q4_K_M   │ MLX     │ GPU  │ 199.9%   │ 32k     │ —           │
│ 🔴 Too Tight   │ moonshotai/Kimi-K2-Instruct                   │ moonshotai    │ 1026.5B │ 47    │ 0.8        │ Q4_K_M   │ MLX     │ GPU  │ 6572.5%  │ 4194k   │ 2025-07-11  │
│ 🔴 Too Tight   │ Qwen/Qwen2.5-32B-Instruct                     │ Alibaba       │ 32.5B   │ 46    │ 2.3        │ Q4_K_M   │ MLX     │ GPU  │ 268.6%   │ 131k    │ —           │
│ 🔴 Too Tight   │ tiiuae/falcon-180B-chat                       │ TII           │ 179.5B  │ 46    │ 0.4        │ Q4_K_M   │ MLX     │ GPU  │ 1381.3%  │ 4k      │ 2023-09-04  │
│ 🔴 Too Tight   │ allenai/OLMo-2-0325-32B-Instruct              │ allenai       │ 32.2B   │ 46    │ 2.3        │ Q4_K_M   │ MLX     │ GPU  │ 252.4%   │ 4k      │ 2025-03-12  │
│ 🔴 Too Tight   │ 01-ai/Yi-34B-Chat                             │ 01.ai         │ 34.4B   │ 46    │ 2.2        │ Q4_K_M   │ MLX     │ GPU  │ 269.6%   │ 4k      │ —           │
│ 🔴 Too Tight   │ tiiuae/falcon-40b-instruct                    │ TII           │ 40.0B   │ 45    │ 1.9        │ Q4_K_M   │ MLX     │ GPU  │ 304.4%   │ 2k      │ —           │
╰────────────────┴───────────────────────────────────────────────┴───────────────┴─────────┴───────┴────────────┴──────────┴─────────┴──────┴──────────┴─────────┴─────────────╯
  Note: tok/s values are baseline estimates; real runtime depends on engine/runtime.

import { Controller, Get, Query, Inject, Header } from '@nestjs/common';
import { AI_METRIC_REPOSITORY_PORT } from '@agentes/domain';
import type { IAiMetricRepository } from '@agentes/domain';

@Controller('metrics')
export class MetricsController {
  constructor(
    @Inject(AI_METRIC_REPOSITORY_PORT)
    private readonly metricRepository: IAiMetricRepository,
  ) {}

  @Get('usage')
  async getUsage(@Query('days') days?: string) {
    const period = days ? parseInt(days) : 7;
    return this.metricRepository.getUsageSummary(period);
  }

  @Get('dashboard')
  @Header('Content-Type', 'text/html')
  async getDashboard() {
    const data = await this.metricRepository.getUsageSummary(30);
    const recent = await this.metricRepository.getRecentLogs(50);
    
    // Matriz de Precios por 1 Millón de Tokens (USD)
    const PRICING: Record<string, { in: number, out: number }> = {
      'meta/llama-3.3-70b-instruct': { in: 0.70, out: 0.70 },
      'gemini-1.5-flash': { in: 0.075, out: 0.30 },
      'gemini-1.5-pro': { in: 3.50, out: 10.50 },
      'gpt-4o': { in: 5.00, out: 15.00 },
      'llama3': { in: 0, out: 0 } // Ollama Local
    };

    const calculateCost = (model: string, pIn: number, pOut: number) => {
      const modelLower = model.toLowerCase();
      const key = Object.keys(PRICING).find(k => modelLower.includes(k.toLowerCase())) || 'meta/llama-3.3-70b-instruct';
      const price = PRICING[key];
      return ((pIn / 1_000_000) * price.in) + ((pOut / 1_000_000) * price.out);
    };

    // Calcular gasto actual vs proyecciones
    let currentTotalSpend = 0;
    let spendIfGpt4 = 0;
    let spendIfGeminiPro = 0;

    data.usage.forEach(u => {
      currentTotalSpend += calculateCost(u.model, u.totalPromptTokens, u.totalCompletionTokens);
      spendIfGpt4 += calculateCost('gpt-4o', u.totalPromptTokens, u.totalCompletionTokens);
      spendIfGeminiPro += calculateCost('gemini-1.5-pro', u.totalPromptTokens, u.totalCompletionTokens);
    });

    const savings = spendIfGpt4 - currentTotalSpend;

    // Preparar datos para los gráficos
    const labels = recent.map(r => new Date(r.timestamp).toLocaleTimeString()).reverse();
    const tokenData = recent.map(r => r.totalTokens).reverse();
    const latencyData = recent.map(r => r.latencyMs).reverse();

    // Desglose para gráfico de pastel
    const pieTotals = recent.reduce((acc, r) => {
      acc.system += (r.systemTokens || 0);
      acc.history += (r.historyTokens || 0);
      acc.rag += (r.ragTokens || 0);
      acc.completion += (r.completionTokens || 0);
      return acc;
    }, { system: 0, history: 0, rag: 0, completion: 0 });

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="refresh" content="60">
          <title>Frescoh! AI Command Center</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
          <style>
              body { background-color: #f9fafb; font-family: 'Inter', sans-serif; }
              .card { background: white; border-radius: 1rem; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
          </style>
      </head>
      <body class="p-4 md:p-8">
          <div class="max-w-7xl mx-auto">
              <header class="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                  <div>
                    <h1 class="text-3xl font-black text-green-900 flex items-center gap-2">
                      <span class="text-4xl">🚜</span> FRESCOH! AI COMMAND CENTER
                    </h1>
                    <p class="text-gray-500 font-medium">Analítica de Tokens y Eficiencia de Modelos</p>
                  </div>
                  <div class="flex items-center gap-3">
                    <span class="flex h-3 w-3 relative">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    <span class="bg-white border border-gray-200 px-4 py-2 rounded-lg text-sm font-bold text-gray-700 shadow-sm">
                      Auto-refresh: 60s
                    </span>
                  </div>
              </header>

              <!-- KPI Cards -->
              <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                  <div class="card p-6 border-l-4 border-l-blue-500">
                      <p class="text-gray-500 text-xs uppercase tracking-wider font-black">Transacciones (30d)</p>
                      <p class="text-3xl font-bold text-gray-800">${data.usage.reduce((a, b) => a + b.totalCalls, 0)}</p>
                  </div>
                  <div class="card p-6 border-l-4 border-l-green-500">
                      <p class="text-gray-500 text-xs uppercase tracking-wider font-black">Inversión (USD)</p>
                      <p class="text-3xl font-bold text-green-600">$${currentTotalSpend.toFixed(4)}</p>
                      <p class="text-[10px] text-gray-400 font-bold mt-1">Ahorro vs GPT-4: $${savings.toFixed(2)}</p>
                  </div>
                  <div class="card p-6 border-l-4 border-l-orange-500">
                      <p class="text-gray-500 text-xs uppercase tracking-wider font-black">Latencia Media</p>
                      <p class="text-3xl font-bold text-orange-500">${(data.usage.reduce((a, b) => a + b.avgLatencyMs, 0) / (data.usage.length || 1)).toFixed(0)} ms</p>
                  </div>
                  <div class="card p-6 border-l-4 border-l-purple-500">
                      <p class="text-gray-500 text-xs uppercase tracking-wider font-black">Simulación Premium</p>
                      <div class="flex flex-col gap-1 mt-1">
                        <div class="flex justify-between text-[10px] font-bold">
                          <span class="text-gray-400 uppercase">Gemini Pro:</span>
                          <span class="text-indigo-600">$${spendIfGeminiPro.toFixed(3)}</span>
                        </div>
                        <div class="flex justify-between text-[10px] font-bold">
                          <span class="text-gray-400 uppercase">GPT-4o:</span>
                          <span class="text-red-500">$${spendIfGpt4.toFixed(3)}</span>
                        </div>
                      </div>
                  </div>
              </div>

              <!-- Charts Row -->
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
                  <div class="lg:col-span-2 card p-6">
                      <h3 class="text-lg font-bold text-gray-800 mb-4">📈 Evolución de Tokens y Latencia (Montaña)</h3>
                      <div class="h-[300px]">
                        <canvas id="mainChart"></canvas>
                      </div>
                  </div>
                  <div class="card p-6">
                      <h3 class="text-lg font-bold text-gray-800 mb-4">🍰 Desglose de Contexto</h3>
                      <div class="h-[300px] flex justify-center">
                        <canvas id="pieChart"></canvas>
                      </div>
                  </div>
              </div>

              <!-- Main Table -->
              <div class="card overflow-hidden mb-12">
                  <div class="bg-gray-50 px-6 py-4 border-b border-gray-200">
                    <h3 class="font-bold text-gray-700 uppercase tracking-tight">Comparativa de Modelos</h3>
                  </div>
                  <table class="w-full text-left border-collapse">
                      <thead class="bg-gray-50 border-b border-gray-200">
                          <tr>
                              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Proveedor / Modelo</th>
                              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Llamadas</th>
                              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase">P / C / T</th>
                              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-center">S / H / R</th>
                              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">Costo Est.</th>
                          </tr>
                      </thead>
                      <tbody class="divide-y divide-gray-200">
                          ${data.usage.map(u => {
                            const cost = calculateCost(u.model, u.totalPromptTokens, u.totalCompletionTokens);
                            return `
                              <tr class="hover:bg-gray-50 transition-colors">
                                  <td class="px-6 py-4">
                                      <div class="font-bold text-gray-800 uppercase text-sm">${u.provider}</div>
                                      <div class="text-[10px] text-gray-400 font-mono">${u.model}</div>
                                  </td>
                                  <td class="px-6 py-4 text-gray-600 font-medium">${u.totalCalls}</td>
                                  <td class="px-6 py-4">
                                      <div class="text-sm font-black text-gray-700">${u.totalTokens.toLocaleString()}</div>
                                      <div class="text-[10px] text-gray-400 font-bold">${u.totalPromptTokens}P / ${u.totalCompletionTokens}C</div>
                                  </td>
                                  <td class="px-6 py-4">
                                      <div class="flex justify-center gap-1">
                                        <span class="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded font-bold" title="System">${u.avgSystemTokens || 0}</span>
                                        <span class="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] rounded font-bold" title="History">${u.avgHistoryTokens || 0}</span>
                                        <span class="px-2 py-0.5 bg-orange-50 text-orange-700 text-[10px] rounded font-bold" title="RAG">${u.avgRagTokens || 0}</span>
                                      </div>
                                  </td>
                                  <td class="px-6 py-4 text-right">
                                      <div class="text-sm font-black text-green-600">$${cost.toFixed(4)}</div>
                                      <div class="text-[9px] text-gray-400 italic">Avg: $${(cost / u.totalCalls).toFixed(5)}</div>
                                  </td>
                              </tr>
                            `;
                          }).join('')}
                      </tbody>
                  </table>
              </div>

              <!-- Recent Activity -->
              <h2 class="text-2xl font-black text-green-900 mb-6">🕒 ÚLTIMAS 50 TRANSACCIONES</h2>
              <div class="card overflow-hidden">
                  <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse text-sm">
                        <thead class="bg-gray-900 text-white uppercase text-[10px] tracking-widest">
                            <tr>
                                <th class="px-6 py-4">Fecha / Hora</th>
                                <th class="px-6 py-4">P / C / T</th>
                                <th class="px-6 py-4 text-center">S / H / R</th>
                                <th class="px-6 py-4 w-1/3">Snippet (Input del Usuario)</th>
                                <th class="px-6 py-4">Latencia</th>
                                <th class="px-6 py-4 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200">
                            ${recent.map(r => `
                                <tr class="hover:bg-green-50 transition-all border-l-4 ${r.status === 'ERROR' ? 'border-l-red-500 bg-red-50' : 'border-l-transparent'}">
                                    <td class="px-6 py-4 font-mono text-[11px] text-gray-500">
                                        ${new Date(r.timestamp).toLocaleDateString('es-CO')} <br>
                                        <span class="text-gray-900 font-bold">${new Date(r.timestamp).toLocaleTimeString('es-CO')}</span>
                                    </td>
                                    <td class="px-6 py-4">
                                        <div class="font-bold text-gray-800">${r.totalTokens}</div>
                                        <div class="text-[9px] text-gray-400">${r.promptTokens} in / ${r.completionTokens} out</div>
                                    </td>
                                    <td class="px-6 py-4 text-center font-mono text-[10px]">
                                      <span class="text-blue-600">${r.systemTokens || 0}</span> / 
                                      <span class="text-indigo-600">${r.historyTokens || 0}</span> / 
                                      <span class="text-orange-600">${r.ragTokens || 0}</span>
                                    </td>
                                    <td class="px-6 py-4">
                                        <div class="text-[11px] text-gray-600 leading-relaxed line-clamp-2 max-w-xs" title="${r.promptSnippet}">
                                            ${r.promptSnippet || '<em class="text-gray-300">No snippet</em>'}
                                        </div>
                                    </td>
                                    <td class="px-6 py-4">
                                        <span class="px-2 py-1 rounded font-bold text-[10px] ${r.latencyMs > 5000 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}">
                                            ${(r.latencyMs / 1000).toFixed(2)}s
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 text-right font-black text-[10px] ${r.status === 'SUCCESS' ? 'text-green-600' : 'text-red-600'}">
                                        ${r.status}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                  </div>
              </div>

              <footer class="mt-12 text-center text-gray-400 text-[10px] uppercase tracking-widest font-black">
                  Sistema de Inteligencia Frescoh! • Engine: J.A.R.V.I.S. V2.0 • Data Sync: ${new Date().toLocaleTimeString()}
              </footer>
          </div>

          <script>
            // Gráfico de Montaña (Área)
            const ctxMain = document.getElementById('mainChart').getContext('2d');
            new Chart(ctxMain, {
              type: 'line',
              data: {
                labels: ${JSON.stringify(labels)},
                datasets: [{
                  label: 'Tokens Totales',
                  data: ${JSON.stringify(tokenData)},
                  borderColor: '#10b981',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  fill: true,
                  tension: 0.4,
                  yAxisID: 'y'
                }, {
                  label: 'Latencia (ms)',
                  data: ${JSON.stringify(latencyData)},
                  borderColor: '#f59e0b',
                  backgroundColor: 'transparent',
                  borderDash: [5, 5],
                  tension: 0.1,
                  yAxisID: 'y1'
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Tokens' } },
                  y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Ms' } }
                },
                plugins: { legend: { position: 'bottom' } }
              }
            });

            // Gráfico de Pastel (Pie)
            const ctxPie = document.getElementById('pieChart').getContext('2d');
            new Chart(ctxPie, {
              type: 'doughnut',
              data: {
                labels: ['Instrucciones (S)', 'Historial (H)', 'Conocimiento (R)', 'Respuestas (C)'],
                datasets: [{
                  data: [${pieTotals.system}, ${pieTotals.history}, ${pieTotals.rag}, ${pieTotals.completion}],
                  backgroundColor: ['#3b82f6', '#6366f1', '#f59e0b', '#10b981']
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
              }
            });
          </script>
      </body>
      </html>
    `;
  }
}

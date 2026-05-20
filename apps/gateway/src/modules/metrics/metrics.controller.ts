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
    
    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Frescoh! AI Observability</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
              body { background-color: #f3f4f6; }
          </style>
      </head>
      <body class="p-8">
          <div class="max-w-6xl mx-auto">
              <header class="flex justify-between items-center mb-8">
                  <h1 class="text-3xl font-bold text-green-800">🚜 Frescoh! AI Observability</h1>
                  <span class="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold">
                      Últimos 30 días
                  </span>
              </header>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                      <p class="text-gray-500 text-sm mb-1 uppercase font-bold">Total Llamadas</p>
                      <p class="text-3xl font-bold text-gray-800">${data.usage.reduce((a, b) => a + b.totalCalls, 0)}</p>
                  </div>
                  <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                      <p class="text-gray-500 text-sm mb-1 uppercase font-bold">Total Tokens</p>
                      <p class="text-3xl font-bold text-blue-600">${data.usage.reduce((a, b) => a + b.totalTokens, 0).toLocaleString()}</p>
                  </div>
                  <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                      <p class="text-gray-500 text-sm mb-1 uppercase font-bold">Latencia Promedio</p>
                      <p class="text-3xl font-bold text-orange-500">${(data.usage.reduce((a, b) => a + b.avgLatencyMs, 0) / (data.usage.length || 1)).toFixed(0)} ms</p>
                  </div>
              </div>

              <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <table class="w-full text-left border-collapse">
                      <thead class="bg-gray-50 border-b border-gray-200">
                          <tr>
                              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Proveedor / Modelo</th>
                              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Llamadas</th>
                              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Tokens (P/C/T)</th>
                              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Contexto (S/H/R)</th>
                              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Latencia Media</th>
                              <th class="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Éxito</th>
                          </tr>
                      </thead>
                      <tbody class="divide-y divide-gray-200">
                          ${data.usage.map(u => `
                              <tr class="hover:bg-gray-50">
                                  <td class="px-6 py-4">
                                      <div class="font-bold text-gray-800">${u.provider}</div>
                                      <div class="text-xs text-gray-500">${u.model}</div>
                                  </td>
                                  <td class="px-6 py-4 text-gray-600">${u.totalCalls}</td>
                                  <td class="px-6 py-4">
                                      <div class="text-sm font-semibold">${u.totalTokens.toLocaleString()}</div>
                                      <div class="text-xs text-gray-400">${u.totalPromptTokens} / ${u.totalCompletionTokens}</div>
                                  </td>
                                  <td class="px-6 py-4">
                                      <div class="text-sm text-gray-600">
                                        <span title="System">${u.avgSystemTokens || 0}</span> / 
                                        <span title="History">${u.avgHistoryTokens || 0}</span> / 
                                        <span title="RAG">${u.avgRagTokens || 0}</span>
                                      </div>
                                  </td>
                                  <td class="px-6 py-4 text-gray-600">${u.avgLatencyMs} ms</td>
                                  <td class="px-6 py-4">
                                      <span class="px-2 py-1 rounded text-xs font-bold ${u.successRate > 90 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                                          ${u.successRate}%
                                      </span>
                                  </td>
                              </tr>
                          `).join('')}
                      </tbody>
                  </table>
              </div>
              <footer class="mt-8 text-center text-gray-400 text-sm italic">
                  Actualizado en tiempo real por J.A.R.V.I.S. • ${new Date().toLocaleString()}
              </footer>
          </div>
      </body>
      </html>
    `;
  }
}

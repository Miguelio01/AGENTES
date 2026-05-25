module.exports = {
  apps: [
    {
      name: 'frescoh-gateway',
      script: 'pnpm',
      args: 'start:prod',
      cwd: './apps/gateway',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/gateway_err.log',
      out_file: './logs/gateway_out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    },
    {
      name: 'frescoh-adk-agent',
      script: 'uv',
      args: 'run python main.py',
      cwd: './apps/adk-sales-agent',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 8000
      },
      error_file: './logs/adk_err.log',
      out_file: './logs/adk_out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    }
  ]
};

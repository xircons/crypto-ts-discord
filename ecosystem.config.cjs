module.exports = {
  apps: [
    {
      name: 'backend-dev',
      cwd: './backend',
      script: 'src/app.js',
      interpreter: 'node',
      watch: ['src'],
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'coverage', 'logs', '.git'],
      watch_options: { usePolling: true, interval: 1000 },
      env: {
        NODE_ENV: 'development'
      }
    },
    {
      name: 'web-dev',
      cwd: './web',
      script: './node_modules/vite/bin/vite.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'development'
      }
    },
    {
      name: 'valorant-bot',
      cwd: './bot',
      script: 'src/index.js',
      interpreter: 'node',
      watch: ['src'],
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'logs', '.git'],
      watch_options: { usePolling: true, interval: 1000 },
      env: {
        NODE_ENV: 'development'
      }
    }
  ]
};



const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const port = parseInt(process.env.PORT || '3000', 10)
const app = next({ dev: false })
const handle = app.getRequestHandler()

// Cierre limpio ante señales del proceso manager (PM2, Passenger, systemd)
process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT',  () => process.exit(0))

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res, parse(req.url, true))
  }).listen(port, () => {
    console.log(`> Ready on port ${port}`)
  })
})

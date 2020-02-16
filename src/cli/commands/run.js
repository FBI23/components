/*
 * CLI: Command: RUN
 */

const { ServerlessSDK } = require('@serverless/platform-client')
const utils = require('../utils')

module.exports = async (config, cli, command) => {

  // Start CLI persistance status
  cli.start('Initializing', { timer: true })

  // Ensure the user is logged in, or advertise
  if (!utils.isLoggedIn()) { cli.advertise() }

  // Load YAML
  const instanceYaml = await utils.loadInstanceConfig(process.cwd())

  // Presentation
  const meta = `Action: "${command}" - Stage: "${instanceYaml.stage}" - App: "${instanceYaml.app}" - Instance: "${instanceYaml.name}"`
  if (!config.debug) {
    cli.logLogo()
    cli.log(meta, 'grey')
  } else {
    cli.log(meta)
  }

  cli.status('Initializing', instanceYaml.name)

  // Get access key
  const accessKey = await utils.getTokenId()

  // Check they are logged in
  if (!accessKey) {
    cli.error(`Run 'serverless login' first to run your serverless component.`, true)
  }

  // Load Instance Credentials
  const instanceCredentials = await utils.loadInstanceCredentials(instanceYaml.stage)

  // initialize SDK
  const sdk = new ServerlessSDK({
    accessKey,
    context: {
      orgName: instanceYaml.org
    }
  })

  // Prepare Options
  const options = {}
  options.debug = config.debug
  options.dev = config.dev

  // connect if in debug mode
  if (options.debug) {
    await sdk.connect({
      filter: {
        stageName: instanceYaml.stage,
        appName: instanceYaml.app,
        instanceName: instanceYaml.name
      },     
      onEvent: (evt) => {
        if (evt.event !== 'instance.run.logs') return
        if (evt.data.logs && Array.isArray(evt.data.logs)) {
          evt.data.logs.forEach((log) => {
            // Remove strange formatting that comes from stderr
            if (typeof log.data === 'string' && log.data.startsWith(`'`))  log.data = log.data.substr(1)
            if (typeof log.data === 'string' && log.data.endsWith(`'`)) log.data = log.data.substring(0, log.data.length - 1)
            if (typeof log.data === 'string' && log.data.endsWith(`\\n`)) log.data = log.data.substring(0, log.data.length - 2)
            cli.log(log.data)
          })
        }
      }
    })
  }

  if (command === 'deploy') {
    // Warn about dev agent
    if (options.dev) {
      cli.log()
      cli.log('"--dev" option detected.  Dev Agent will be added to your code.  Do not deploy this in your production stage.', 'grey')
    }

    // run deploy
    cli.status('Deploying', null, 'white')
    const instance = await sdk.deploy(instanceYaml, instanceCredentials, options)
    cli.log()
    cli.logOutputs(instance.outputs)
  } else if (command === 'remove') {
    // run remove
    cli.status('Removing', null, 'white')
    await sdk.remove(instanceYaml, instanceCredentials, options)
  } else {
    // run a custom method
    cli.status('Running', null, 'white')
    await sdk.run(command, instanceYaml, instanceCredentials, options)
  }
  cli.close('success', 'Success')
}

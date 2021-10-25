import { InteractionContext } from '../Connection'
import { loadLogger, Logger } from '../logger'
import { ensureSocketIsOpen } from '../util'
import { submitTx } from './submitTx'

/**
 * See also {@link createTxSubmissionClient} for creating a client.
 *
 * @category TxSubmission
 **/
export interface TxSubmissionClient {
  context: InteractionContext
  submitTx: (bytes: string) => ReturnType<typeof submitTx>
  shutdown: () => Promise<void>
}

/**
 * Create a client for submitting signed transactions to underlying Cardano chain.
 *
 * @category Constructor
 **/
export const createTxSubmissionClient = async (
  context: InteractionContext,
  options?: { logger?: Logger }
): Promise<TxSubmissionClient> => {
  const logger = loadLogger('createTxSubmissionClient', options?.logger)
  logger.debug('Init')
  const { socket } = context
  return Promise.resolve({
    context,
    submitTx: (bytes) => {
      logger.debug('submitting tx', { bytes })
      ensureSocketIsOpen(socket)
      return submitTx(context, bytes)
    },
    shutdown: () => new Promise(resolve => {
      logger.info('Shutting down TxSubmissionClient...')
      ensureSocketIsOpen(socket)
      socket.once('close', () => {
        logger.info('TxSubmissionClient socket closed')
        return resolve()
      })
      socket.close()
    })
  } as TxSubmissionClient)
}

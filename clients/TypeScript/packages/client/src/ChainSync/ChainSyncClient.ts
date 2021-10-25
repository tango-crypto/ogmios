import { Block, Ogmios, PointOrOrigin, TipOrOrigin } from '@cardano-ogmios/schema'
import { InteractionContext } from '../Connection'
import { UnknownResultError } from '../errors'
import fastq from 'fastq'
import { loadLogger, Logger } from '../logger'
import { createPointFromCurrentTip, ensureSocketIsOpen, safeJSON } from '../util'
import { findIntersect, Intersection } from './findIntersect'
import { requestNext } from './requestNext'

/**
 * See also {@link createChainSyncClient} for creating a client.
 *
 * @category ChainSync
 */
export interface ChainSyncClient {
  context: InteractionContext
  shutdown: () => Promise<void>
  startSync: (
    points?: PointOrOrigin[],
    inFlight?: number
  ) => Promise<Intersection>
}

/** @category ChainSync */
export interface ChainSyncMessageHandlers {
  rollBackward: (
    response: {
      point: PointOrOrigin,
      tip: TipOrOrigin
    },
    requestNext: () => void
  ) => Promise<void>
  rollForward: (
    response: {
      block: Block,
      tip: TipOrOrigin
    },
    requestNext: () => void
  ) => Promise<void>
}

/** @category Constructor */
export const createChainSyncClient = async (
  context: InteractionContext,
  messageHandlers: ChainSyncMessageHandlers,
  options?: { logger?: Logger, sequential?: boolean }
): Promise<ChainSyncClient> => {
  const logger = loadLogger('createChainSyncClient', options?.logger)
  logger.debug('Init')
  const { socket } = context
  return new Promise((resolve) => {
    const messageHandler = async (response: Ogmios['RequestNextResponse']) => {
      if ('RollBackward' in response.result) {
        const res = { point: response.result.RollBackward.point, tip: response.result.RollBackward.tip }
        logger.debug({ instruction: 'RollBackward', ...res })
        await messageHandlers.rollBackward(res, () => requestNext(socket))
      } else if ('RollForward' in response.result) {
        const res = { block: response.result.RollForward.block, tip: response.result.RollForward.tip }
        logger.debug({ instruction: 'RollForward', ...res })
        await messageHandlers.rollForward(res, () => { requestNext(socket) })
      } else {
        throw new UnknownResultError(response.result)
      }
    }
    const responseHandler = options?.sequential !== false
      ? fastq.promise(messageHandler, 1).push
      : messageHandler
    socket.on('message', async (message: string) => {
      const response: Ogmios['RequestNextResponse'] = safeJSON.parse(message)
      logger.debug('Response', { response })
      if (response.methodname === 'RequestNext') {
        try {
          await responseHandler(response)
        } catch (error) {
          console.error(error)
        }
      }
    })
    return resolve({
      context,
      shutdown: () => new Promise(resolve => {
        logger.info('Shutting down ChainSyncClient...')
        ensureSocketIsOpen(socket)
        socket.once('close', () => {
          logger.info('ChainSyncClient socket closed')
          return resolve()
        })
        socket.close()
      }),
      startSync: async (points, inFlight) => {
        logger.info('Starting ChainSyncClient sync...')
        const intersection = await findIntersect(
          context,
          points || [await createPointFromCurrentTip(context)]
        )
        ensureSocketIsOpen(socket)
        for (let n = 0; n < (inFlight || 100); n += 1) {
          requestNext(socket)
        }
        logger.info({ intersection }, 'ChainSyncClient syncing')
        return intersection
      }
    })
  })
}

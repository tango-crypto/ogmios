import { nanoid } from 'nanoid'
import { InteractionContext } from '../Connection'
import { baseRequest, send } from '../Request'
import { safeJSON } from '../util'
import { UnknownResultError } from '../errors'
import { loadLogger, Logger } from '../logger'

/** @internal */
export const Query = <
  Request,
  QueryResponse extends { reflection?: { requestId?: string } },
  Response
  >(
    request: {
    methodName: string,
    args?: any
  },
    response: {
    handler: (
      response: QueryResponse,
      resolve: (value?: Response | PromiseLike<Response>) => void,
      reject: (reason?: any) => void
    ) => void
  },
    context: InteractionContext,
    options?: {
      logger: Logger
    }
  ): Promise<Response> => {
  const logger = loadLogger('Query', options?.logger)
  return send<Response>((socket) =>
    new Promise((resolve, reject) => {
      const requestId = nanoid(5)
      async function listener (data: string) {
        const queryResponse = safeJSON.parse(data) as QueryResponse
        logger.debug('response', queryResponse)
        if (queryResponse.reflection?.requestId !== requestId) { return }
        try {
          await response.handler(
            queryResponse,
            resolve,
            reject
          )
        } catch (e) {
          return reject(new UnknownResultError(queryResponse))
        }
        socket.removeListener('message', listener)
      }

      socket.on('message', listener)
      socket.send(safeJSON.stringify({
        ...baseRequest,
        methodname: request.methodName,
        args: request.args,
        mirror: { requestId }
      } as unknown as Request))
    }), context, { logger: options?.logger })
}

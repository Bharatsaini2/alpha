import dotenv from 'dotenv'
dotenv.config()

const myHeaders = new Headers()
myHeaders.append('x-api-key', process.env.SHYFT_API_KEY!)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const MAX_REQUESTS_PER_SECOND = 10
const RETRY_LIMIT = 3
const INITIAL_RETRY_DELAY = 5000

export const getParsedTransactions = (
  signature: string,
  retries = RETRY_LIMIT,
  delay = INITIAL_RETRY_DELAY,
) => {
  let parsedTx

  const requestOptions: any = {
    method: 'GET',
    headers: myHeaders,
    redirect: 'follow',
  }

  return fetch(
    `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}&commitment=confirmed`,
    requestOptions,
  )
    .then((response: any): any => {
      if (response.status === 429) {
        console.warn(
          `Rate limit hit for signature: ${signature}, retrying after ${delay}ms...`,
        )
        if (retries > 0) {
          return sleep(delay).then(() =>
            getParsedTransactions(signature, retries - 1, delay * 2),
          )
        } else {
          throw new Error(`Rate limit exceeded after ${RETRY_LIMIT} attempts`)
        }
      }

      return response.text()
    })
    .then((result) => {
      parsedTx = result
      return parsedTx
    })
    .catch((error) => {
      console.error(
        `Error fetching parsed transactions for signature ${signature}:`,
        error,
      )
      console.log(
        `Error fetching parsed transactions for signature ${signature}:`,
        error,
      )
      return null
    })
}

import axios, { request } from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const TWITTER_BEARER_TOKEN = process.env.ALPHAX_AGENT_X_BEARER_TOKEN

export const getKolProfileFollowerFunction = async (kolUsername: string) => {

  const username = kolUsername.replace('@', '')
  const url = `https://api.twitter.com/2/users/by/username/${username}?user.fields=profile_image_url,public_metrics`

  try {
    const axiosResponse = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${TWITTER_BEARER_TOKEN}`,
      },
    })
    const data = await axiosResponse.data
   
    return data
  } catch (error: any) {
    console.error(error.message)
    return null
  }
}


export const getKolProfileFollower = async (request: any, response: any) => {
  const kolUsername = request.query.kolUsername as string
  const username = kolUsername.replace('@', '')
  const url = `https://api.twitter.com/2/users/by/username/${username}?user.fields=profile_image_url,public_metrics`

  try {
    const axiosResponse = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${TWITTER_BEARER_TOKEN}`,
      },
    })
    const data = await axiosResponse.data
   
    response.status(200).json(data)
  } catch (error) {
    console.error(error)
    response.status(500).json({ error: error})
  }
}

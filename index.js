"use strict"

const redis  = require("redis")
const bluebird = require("bluebird")
const _ = require("underscore")
const route = require("path-match")()

bluebird.promisifyAll(redis.RedisClient.prototype)
bluebird.promisifyAll(redis.Multi.prototype)

const orderHash = hash => {
	const ordered = {}

  _.chain(hash).keys().sortBy().value().forEach(key => {
		ordered[key] = hash[key]
	})
	return ordered
}

/* add to res obj a event emission when send or end is call */
const addEvents = res => {
	const emitEvents = (res, body) => {

		if (body && res.statusCode < 300) {

			const { method } = res.req
			if(method === "GET") {
		    const headers = res._headers
			  res.emit("data", { body, headers })
			} else {
			
				res.emit("expire" )
			}
		}
	}

	let send = res.send.bind(res)

  res.send = body => {
		emitEvents(res, body)
    return send(body)
  }

	let end = res.end.bind(res)
	
  res.end = body => {

		emitEvents(res, body)
		return end(body)
  }
}



module.exports = class CacheMiddleware {
	
	constructor(config) {
		this.config = config
		this.logger = config.logger || console


		/* TODO - order keys for cache */
		this.buildKeyPrefix = (req, useInKey = {}) => {
			const { headers, reqProps } = useInKey
			let prefix = ""

			if(reqProps && reqProps.map)
				prefix += "req_props:" + reqProps.map(prop => `${prop}:${req[prop]}`).join(":")
			
			if(headers && headers.map)
				prefix += "headers:" + orderHash(headers)
															 .map(header => `${header}:${req.headers[header]}`)
															 .join(":")

			return prefix
		}

		this.buildKey = (req, useInKey = {}) => {

			const { headers, reqProps } = useInKey

			const key = this.buildKeyPrefix(req, useInKey) + req.originalUrl
			return key
		}
	}

	middleware(opts = {}) {
		const { logger, config } = this
		const { url, ttl } = config
		
		const { useInKey, whitelist } = opts

		const redisClient = redis.createClient(url)

		const whitelistMatchs = whitelist.map(path => route(path) )

		const inWhitelist = path => {
			for(const match of whitelistMatchs) {
				
				if(match(path))
				  return true
			}
			return false
		}

		return (req, res, next) => {
			
			const { method } = req
			
			addEvents(res)

			if(method.match(/GET/)) {

		   	res.set("x-server-side-cache", false )
				if(inWhitelist(req.path)) {
					debugger
					next()
			  } else {
					/* try match cache */
					const key = this.buildKey(req, useInKey)
					redisClient.getAsync(key)
										.then(content => {
											if(content) {
												const [ headers , body ] = JSON.parse(content)
													// popule headers
												_(headers).each((v, k) => {
													res.set(k, v)
												})
												res.set("x-server-side-cache", true )
												res.send(body)
											} else {
												res.once("data", data => {
														const { headers, body } = data

														redisClient.setex(
															key, 
															ttl, 
															JSON.stringify([ headers, body ]) 
														)
												})
												next()
											}
										})
										.catch(logger.error)
				}
			/* expire cache */
			} else {

				res.once("expire", () => {
					const prefix = this.buildKeyPrefix(req, useInKey)
					redisClient
					.keysAsync(prefix + "*")
					.then(keys =>  keys.map(key => redisClient.delAsync(key)))
				})
				next()
			}
		}
	}
}
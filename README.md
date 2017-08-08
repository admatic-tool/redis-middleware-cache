cache middleware for express.js
===

# install:
```shell
$ npm install cache-middleware-redis
```

# usage:
```javascript

const app = require("express")()

const MiddlewareCache = require("middleware-cache")

const redisConfig = { 
  url: "redis://localhost",
  ttl: 2
}

const middlewareFactory = new MiddlewareCache(redisConfig) 


/* fake auth middleware that inject account_id in req props */
app.use((req, res, next) => {
  req.account_id = req.cookies.account_id
  next()
})


const middlewareConfig = { 
  useInKey: {
    reqProps: [ "account_id" ]
  }
}

/* to can get req.params */
app.use(middlewareFactory.middleware(middlewareConfig))

app.get("/ads/:id", (req, res) => {
	res.json({ date: new Date })
})

app.put("/ads/:id", (req, res) => {

  if(req.query.error)
    res.status(400).json({ ok: false })
  else
    res.json({ ok: true })
})

```

# TODO

 - whitelist
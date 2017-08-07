
const app = require("express")()
const request = require("supertest")

const MiddlewareCache = require("../index")

const middlewareFactory = new MiddlewareCache({ 
	url: "redis://localhost",
	ttl: 2
}) 

const whitelist = [
	"/ads/in/whitelist/:id"
]

app.use(require("cookie-parser")())

/* fake auth middleware that inject account_id in req props */
app.use((req, res, next) => {
	req.account_id = req.cookies.account_id
	next()
})


const useInKey = {
	reqProps: [ "account_id" ]
}

/* to can get req.params */
app.use(middlewareFactory.middleware({ useInKey, whitelist }))

app.get("/ads/in/whitelist/:id", (req, res) => {
	res.json({ date: new Date })
})


app.get("/ads/:id", (req, res) => {
	res.json({ date: new Date })
})

app.put("/ads/:id", (req, res) => {
	
	if(req.query.error)
		res.status(400).json({ ok: false })
	else
	  res.json({ ok: true })
})


describe("cache data", () => {

	let res, res2, res3

	before(function*() {
		res = yield request(app).get("/ads/xxx?q=test").set("Cookie", ["account_id=123"])

		res2 = yield request(app).get("/ads/xxx?q=test").set("Cookie", ["account_id=123"])
		yield request(app).put("/ads/xxx").send({}).set("Cookie", ["account_id=123"])
		res3 = yield request(app).get("/ads/xxx?q=test").set("Cookie", ["account_id=123"])
	})

	describe("first request", () => {

		it("should responds 200", () => {
			expect(res.status).to.be.equal(200)
		})

		it("should mark a 'x-server-side-cache' headers as false", () => {
			expect(res2.headers["x-server-side-cache"]).to.be.equal("true")
		})
	})

	describe("second request (already cached content)", () => {

		it("should responds 200", () => {
			expect(res2.status).to.be.equal(200)
		})

		it("body should be de same values", () => {
			expect(res2.body).to.be.eql(res.body)
		})

		it("should mark a 'x-server-side-cache' headers as true", () => {
			expect(res2.headers["x-server-side-cache"]).to.be.equal("true")
		})

		it("content-type should be preserved", () => {
			expect(res2.headers["content-type"]).to.be.equal(res.headers["content-type"])
		})
	})

	describe("thidy request (EXPIRED content)", () => {

		it("should responds 200", () => {
			expect(res3.status).to.be.equal(200)
		})

		it("body should NOT be de same values", () => {
			expect(res3.body).to.be.not.eql(res.body)
		})

		it("should mark a 'x-server-side-cache' headers as false", () => {
			expect(res3.headers["x-server-side-cache"]).to.be.equal("false")
		})
	})

	describe("when update fail, cache not EXPIRE", () => {
		
		let res, res2
		
		before(function*() {
			res = yield request(app).get("/ads/xxx?q=test").set("Cookie", ["account_id=123"])
			
			let r = yield request(app).put("/ads/xxx?error=true").send({}).set("Cookie", ["account_id=123"])
			// should fail
			expect(r.status).to.be.equal(400)

			res2 = yield request(app).get("/ads/xxx?q=test").set("Cookie", ["account_id=123"])
		})

		it("should responds 200", () => {
			expect(res2.status).to.be.equal(200)
		})

		it("body should be the same values", () => {
			expect(res2.body).to.be.eql(res.body)
		})

		it("should mark a 'x-server-side-cache' headers as true", () => {
			expect(res2.headers["x-server-side-cache"]).to.be.equal("true")
		})
	})


	describe("clear cache only for one account", () => {
		
		let res1Acc1, res2Acc1, res1Acc2, res2Acc2
		
		let [ acc1_id, acc2_id ] = [ 123, 321 ]
		
		/* the same path*/
		let path = "/ads/xxx?" 
		
		before(function*() {
			
			res1Acc1 = yield request(app).get(path).set("Cookie", [`account_id=${acc1_id}`])
			res1Acc2 = yield request(app).get(path).set("Cookie", [`account_id=${acc2_id}`])

			//* update data in account 1 */
			let r = yield request(app).put(path).set("Cookie", [`account_id=${acc1_id}`])
			expect(r.status).to.be.equal(200)
			
			res2Acc1 = yield request(app).get(path).set("Cookie", [`account_id=${acc1_id}`])

			res2Acc2 = yield request(app).get(path).set("Cookie", [`account_id=${acc2_id}`])
		})

		describe("account 1 cache shold be EXPIRED", () => {
			it("response 2 should mark a 'x-server-side-cache' headers as false", () => {
				expect(res2Acc1.headers["x-server-side-cache"]).to.be.equal("false")
			})

			it("body should be NOT the same value", () => {
			  expect(res2Acc1.body).to.be.not.eql(res1Acc1.body)
			})
		})

		describe("account 2 remains CACHED", () => {

			it("response 2 should mark a 'x-server-side-cache' headers as true", () => {
				expect(res2Acc2.headers["x-server-side-cache"]).to.be.equal("true")
			})

			it("body should be the same values", () => {
			  expect(res2Acc2.body).to.be.eql(res1Acc2.body)
			})
		})
	})

	describe("whitelist route", () => {
		
		let res1, res2
		let path = "/ads/in/whitelist/1213?q=test" 
		
		before(function*() {
			
			res1 = yield request(app).get(path).set("Cookie", [`account_id=123`])
			res2 = yield request(app).get(path).set("Cookie", [`account_id=123`])
		})

		it("response 1 should mark a 'x-server-side-cache' headers as false", () => {
			expect(res1.headers["x-server-side-cache"]).to.be.equal("false")
		})

		it("response 2 should mark a 'x-server-side-cache' headers as false", () => {
			expect(res1.headers["x-server-side-cache"]).to.be.equal("false")
		})

		it("response bodies should be different", () => {
			expect(res1.body).to.be.not.eql(res2.body)
		})
	})
})
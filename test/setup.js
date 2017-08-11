global.expect = require("chai").expect

global.waitSeconds = seconds => 
  new Promise(resolve => setTimeout(resolve, seconds * 1000))

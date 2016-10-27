var Aliexpress = require("./aliexpress")
var moment = require('moment')
var async = require("async")
var products = require("./products")

function online() {
  async.waterfall([function(next){
    aliexpress = new Aliexpress()
    aliexpress.refreshAccessToken().then(function(accessToken){
      next(null, aliexpress, accessToken)
    }).catch(function(err){
      next(err)
    })
  }, function(aliexpress, accessToken, next){
    aliexpress.onlineAeProduct(products).then(function(modifyCount, success){
      next(null, modifyCount, success)
    }).catch(function(err){
      next(err)
    })
  }], function(err, modifyCount, success){
    if(err){
      console.log(err)
    }else{
      console.log("online " + products.length + " products, success: " + modifyCount)
    }
    process.exit()
  })
}

console.log(moment(Date.now()).format("YYYY-MM-DD HH:mm:ss"))
online()
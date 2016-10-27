var request = require("request")
var async = require("async")
var config = require("../config")
var crypto = require('crypto')
var Promise = require("bluebird")
var redis = require("redis")

Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);
var client = redis.createClient();

module.exports = function(refreshToken, accessToken){
  this.clientKey = config.clientKey
  this.clientSecret = config.clientSecret
  this.refreshToken = refreshToken
  this.accessToken = accessToken
  this.host = "gw.api.alibaba.com"
  this.suburl = "/openapi/param2"
  this.version = "1"
  this.namespace = "aliexpress.open"
  function init(that){
    return client.hmgetAsync(["aliexpress:info", "accessToken",
      "expireTime", "refreshToken", "refreshTokenTimeout"]).then(function(data){
        that.accessToken = !!that.accessToken ? that.accessToken : data[0]
        that.expireTime = !!that.expireTime ? that.expireTime : parseInt(data[1])
        that.refreshToken = !!that.refreshToken ? that.refreshToken : data[2]
        that.refreshTokenTimeout = !!that.refreshTokenTimeout ? that.refreshTokenTimeout : data[3]
      })
  }
  init(this)
}

module.exports.prototype.aopSignature = function(params, url) {
  var urlPath = "",
      _sub = ""
  if(params){
    _sub = Object.keys(params).map(function(k) { return (k + "" + params[k]) }).sort().join("")
  }
  if(url && url.indexOf("param2")!= -1){
    urlPath = url.slice(url.indexOf("param2"), url.length)
  }
  sha1Str = crypto.createHmac('sha1', this.clientSecret).update(urlPath+_sub).digest('hex')
  return sha1Str.toUpperCase()
}

module.exports.prototype.genAuthUri = function(redirect_uri, state){
  //http://gw.api.alibaba.com/auth/authorize.htm?client_id=xxx&site=aliexpress&redirect_uri=YOUR_REDIRECT_URL&state=YOUR_PARM&_aop_signature=SIGENATURE
  var url = "http://gw.api.alibaba.com/auth/authorize.htm",
  params = {
    client_id: this.clientKey,
    site: "aliexpress",
    redirect_uri: redirect_uri
  }
  if(state){
    params["state"] = state
  }
  params["_aop_signature"] = this.aopSignature(params)
  console.log(params)
  return (url + "?" + Object.keys(params).map(function(k) { return (k + "=" + encodeURIComponent(params[k]) )}).sort().join("&"))
}


//https://gw.api.alibaba.com/openapi/http/1/system.oauth2/getToken/YOUR_APPKEY?grant_type=authorization_code&need_refresh_token=true&client_id= YOUR_APPKEY&client_secret= YOUR_APPSECRET&redirect_uri=YOUR_REDIRECT_URI&code=CODE
module.exports.prototype.getRefreshToken = function(redirect_uri, code, store){
  var that = this,
      uri = "https://gw.api.alibaba.com/openapi/http/1/system.oauth2/getToken/"+that.clientKey,
      params = {
        grant_type: "authorization_code",
        need_refresh_token: true,
        client_id: that.clientKey,
        client_secret: that.clientSecret,
        redirect_uri: redirect_uri,
        code: code
      },
      options = {
        uri: uri,
        method: "POST",
        form: params
      },
      _store = store || function(refreshTokenTimeout, aliId, resourceOwner, expireTime, refreshToken, accessToken){
        client.hmset(["aliexpress:info", "accessToken", accessToken, "expireTime", expireTime,
          "refreshTokenTimeout", refreshTokenTimeout, "aliId", aliId, "resourceOwner", resourceOwner, "refreshToken", refreshToken])
      }

  return new Promise(function(resolve, reject){
    _requestPost.call(that, options).then(function(data){
      that.accessToken = data.access_token
      that.expireTime = (new Date()).getTime() + data.expires_in * 1000
      that.refreshToken = data.refresh_token
      that.refreshTokenTimeout = data.refresh_token_timeout

      _store(data.refresh_token_timeout, data.aliId, data.resource_owner, that.expireTime, data.refresh_token, data.access_token)
      resolve(data.resource_owner, data.refresh_token, data.access_token)
    }).catch(function(err){
      reject(err)
    })
  })

}

module.exports.prototype.getStoreRefreshToken = function(){
  var that = this
  return new Promise(function(resolve, reject){
    client.hmgetAsync(["aliexpress:info", "refreshToken", "refreshTokenTimeout"]).then(function(data){
      if(!data[0]){
        throw new Error("Missing parameters: refresh_token")
      }
      that.refreshToken = data[0]
      that.refreshTokenTimeout = data[1]
      resolve(that.refreshToken, that.refreshTokenTimeout)
    }).catch(function(err){
      reject(err)
    })
  })
}


// https://gw.api.alibaba.com/openapi/param2/1/system.oauth2/getToken/YOUR_APPKEY
// 请求参数如下：
// grant_type=refresh_token&client_id=YOUR_APPKEY&client_secret=YOUR_APPSECRET&refresh_token=REFRESH_TOKEN
module.exports.prototype.refreshAccessToken = function(refresh_token, isValid, store){
  var that = this,
      _store = store || function(accessToken, expiresIn){
        ((new Date()).getTime() + expiresIn * 1000)
        client.hmset(["aliexpress:info", "accessToken", accessToken, "expireTime", ((new Date()).getTime() + expiresIn * 1000)])
      }
      that.isValid = isValid || that.isValid
      that.refreshToken = refresh_token || that.refreshToken


  return new Promise(function(resolve, reject){
    if(that.isValid()){
      resolve(that.accessToken)
    }else{
      if(!that.refreshToken){
        that.getStoreRefreshToken().then(function(refreshToken){
          var uri = "https://gw.api.alibaba.com/openapi/param2/1/system.oauth2/getToken/"+that.clientKey,
              params = {
                grant_type: "refresh_token",
                client_id: that.clientKey,
                client_secret: that.clientSecret,
                refresh_token: that.refreshToken
              },
              options = {
                uri: uri,
                method: "POST",
                form: params
              }
          _requestPost.call(that, options).then(function(data){
            expiresIn = parseInt(data.expires_in)
            that.accessToken = data.access_token
            that.expireTime = ((new Date()).getTime() + expiresIn * 1000)
            _store(data.access_token, expiresIn)
            resolve(data.access_token)
          }).catch(function(err){
            reject(err)
          })
        }).catch(function(err){
          console.log(err)
          throw new Error("Missing parameters: refresh_token")
        })
      }
    }
  })
}

module.exports.prototype.isValid = function () {
  return !!this.accessToken && (new Date().getTime()) < this.expireTime;
};


module.exports.prototype.onlineAeProduct = function(productIds){
  return _onOffProducts.call(this, productIds, "api.onlineAeProduct")
}

module.exports.prototype.offlineAeProduct = function(productIds){
  return _onOffProducts.call(this, productIds, "api.offlineAeProduct")
}

function _onOffProducts(productIds, name){
  if(productIds.length > 50){
    throw new Error("out of 50 product ids")
  }
  var uri = "http://" + this.host + this.suburl + "/" + this.version + "/" + this.namespace + "/" + name + "/" + this.clientKey,
      that = this
  return new Promise(function(resolve, reject){
    async.waterfall([function(next){
      that.refreshAccessToken(that.refreshToken).then(function(accessToken){
        next(null, accessToken)
      }).catch(function(err){
        reject(err)
      })
    }, function(accessToken){
      var params = {
        _aop_timestamp: Date.now(),
        access_token: accessToken,
        productIds: productIds.join(";")
      }
      params["_aop_signature"] = that.aopSignature(params, uri)
      var options = {
        uri: uri,
        method: "POST",
        form: params
      }
      console.log(options)
      _requestPost.call(that, options).then(function(data){
        if(data.error_code){
          reject(new Error(data.error_code + ":" + data.error_message))
        }else{
          resolve(data.modifyCount, data.success)
        }
      }).catch(function(err){
        reject(err)
      })
    }], function(err){
      if(err){
        console.log(err)
        reject(err)
      }
    })
  })
}


function _requestPost(options){
  var that = this
  return new Promise(function(resolve, reject){
    request.post(options, function(err, res, body){
      console.log(err, res.statusCode, body)
      if(err){
        reject(err)
      }else if(res.statusCode == 200) {
        var data = JSON.parse(body)
        resolve(data)
      }else{
        var data = JSON.parse(body)
        reject(data)
      }
    })
  })
}

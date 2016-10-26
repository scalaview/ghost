var request = require("request")
var async = require("async")
var config = require("../config")
var crypto = require('crypto')
var Promise = require("bluebird")

module.exports = function(){
  this.clientKey = config.clientKey
  this.clientSecret = config.clientSecret
}

module.exports.prototype.aopSignature = function(params, needPrefix) {
  var urlPath = "param2/1/system/currentTime/" + this.clientKey,
      _sub = ""
  if(params){
    _sub = Object.keys(params).map(function(k) { return (k + "" + params[k]) }).sort().join("")
  }
  if(!needPrefix){
    urlPath = ""
  }
  sha1Str = crypto.createHmac('sha1', this.clientSecret).update(urlPath+_sub).digest('hex')
  return sha1Str.toUpperCase()
}

module.exports.prototype.genAuthUri = function(args){
  //http://gw.api.alibaba.com/auth/authorize.htm?client_id=xxx&site=aliexpress&redirect_uri=YOUR_REDIRECT_URL&state=YOUR_PARM&_aop_signature=SIGENATURE
  var url = "http://gw.api.alibaba.com/auth/authorize.htm",
  params = {
    client_id: this.clientKey,
    site: "aliexpress",
    redirect_uri: args["redirect_uri"]
  }
  if(args["state"]){
    params["state"] = args["state"]
  }
  params["_aop_signature"] = this.aopSignature(params)
  console.log(params)
  return (url + "?" + Object.keys(params).map(function(k) { return (k + "=" + encodeURIComponent(params[k]) )}).sort().join("&"))
}


//https://gw.api.alibaba.com/openapi/http/1/system.oauth2/getToken/YOUR_APPKEY?grant_type=authorization_code&need_refresh_token=true&client_id= YOUR_APPKEY&client_secret= YOUR_APPSECRET&redirect_uri=YOUR_REDIRECT_URI&code=CODE
module.exports.prototype.getRefreshToken = function(redirect_uri, code){
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
      }

  return _request(options)
}


// https://gw.api.alibaba.com/openapi/param2/1/system.oauth2/getToken/YOUR_APPKEY
// 请求参数如下：
// grant_type=refresh_token&client_id=YOUR_APPKEY&client_secret=YOUR_APPSECRET&refresh_token=REFRESH_TOKEN
module.exports.prototype.getAccessToken = function(refresh_token){
  var that = this,
      uri = "https://gw.api.alibaba.com/openapi/param2/1/system.oauth2/getToken/"+that.clientKey,
      params = {
        grant_type: "refresh_token",
        client_id: that.clientKey,
        client_secret: that.clientSecret,
        refresh_token: refresh_token
      },
      options = {
        uri: uri,
        method: "POST",
        form: params
      }

  return _request(options)
}


function _request(options){
  return new Promise(function(resolve, reject){
    request.post(options, function(err, res, body){
      console.log(err, res.statusCode, body)
      if (!err && res.statusCode == 200) {
        resolve(body)
      }else{
        reject(err)
      }
    })
  })
}
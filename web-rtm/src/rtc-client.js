import AgoraRTC from 'agora-rtc-sdk';
import {Toast, addView, removeView} from './common';
import EventEmitter from 'events';

console.log("agora sdk version: " + AgoraRTC.VERSION + " compatible: " + AgoraRTC.checkSystemRequirements());

export default class RTCClient {
  constructor () {
    this._client = AgoraRTC.createClient({mode: 'rtc', codec: 'h264'});
    this._joined = false;
    this._published = false;
    this._localStream = null;
    this._remoteStreams = [];
    this._params = {};
    // this._bus = new EventEmitter();

    this.members = [];

    this._showProfile = false;
  }

  set localStream(stream) {
    this._localStream = stream;
  }

  get localStream () {
    return this._localStream;
  }

  set remoteStreams (streams) {
    this._remoteStreams = streams;
  }

  get remoteStreams () {
    return this._remoteStreams;
  }

  on(eventName, callback) {
    this._client.on(eventName, callback);
  }

  subscribe(stream, cb) {
    this._client.subscribe(stream, cb);
  }

  join (data, account) {
    this._account = account;
    return new Promise((resolve, reject) => {    
      if (this._joined) {
        Toast.error("Your already joined");
        return;
      }
    
      /**
       * A class defining the properties of the config parameter in the createClient method.
       * Note:
       *    Ensure that you do not leave mode and codec as empty.
       *    Ensure that you set these properties before calling Client.join.
       *  You could find more detail here. https://docs.agora.io/en/Video/API%20Reference/web/interfaces/agorartc.clientconfig.html
      **/
      
    
      this._params = data;
        
      // init client
      this._client.init(data.appID, () => {
        console.log("init success");
    
        /**
         * Joins an AgoraRTC Channel
         * This method joins an AgoraRTC channel.
         * Parameters
         * tokenOrKey: string | null
         *    Low security requirements: Pass null as the parameter value.
         *    High security requirements: Pass the string of the Token or Channel Key as the parameter value. See Use Security Keys for details.
         *  channel: string
         *    A string that provides a unique channel name for the Agora session. The length must be within 64 bytes. Supported character scopes:
         *    26 lowercase English letters a-z
         *    26 uppercase English letters A-Z
         *    10 numbers 0-9
         *    Space
         *    "!", "#", "$", "%", "&", "(", ")", "+", "-", ":", ";", "<", "=", ".", ">", "?", "@", "[", "]", "^", "_", "{", "}", "|", "~", ","
         *  uid: number | null
         *    The user ID, an integer. Ensure this ID is unique. If you set the uid to null, the server assigns one and returns it in the onSuccess callback.
         *   Note:
         *      All users in the same channel should have the same type (number) of uid.
         *      If you use a number as the user ID, it should be a 32-bit unsigned integer with a value ranging from 0 to (232-1).
        **/
        this._client.join(data.token ? data.token : null, data.channel, data.uid ? +data.uid : null, (uid) => {
          this._params.uid = uid;
          Toast.notice("join channel: " + data.channel + " success, uid: " + uid);
          console.log("join channel: " + data.channel + " success, uid: " + uid);
          this._joined = true;
          // create local stream
          this._localStream = AgoraRTC.createStream({
            streamID: this._params.uid,
            audio: data.audio,
            video: data.video,
            screen: false,
          });

          this._localStream.on("player-status-change", (evt) => {
            console.log("player status change", evt);
          })

          if (data.cameraResolution && data.cameraResolution != 'default') {
            // set local video resolution
            this._localStream.setVideoProfile(data.cameraResolution);
          }
    
          // init local stream
          this._localStream.init(() => {
            console.log("init local stream success");
            
            if (data._video === false) {
              this._localStream.muteVideo();
            }
            if (data._audio === false) {
              this._localStream.muteAudio();
            }
            // play stream with html element id "local_stream"
            this._localStream.play("local_stream", {fit: "cover"});

            const id = this._params.uid;
            
              $("<div/>", {
                id: "uid_" + id,
                class: "toolbar",
              }).appendTo('#local_stream');
      
              const actions = ["muteVideo", "muteAudio"];
              actions.forEach((action) => {
                const item = $("<span/>", {
                  class: action,
                  text: action
                })
                item.attr("data-uid", id);
                item.attr("data-account", this._account);
                item.appendTo("#uid_" + id);
              })
            
            // run callback
            resolve(this._params.uid);
          }, (err) =>  {
            Toast.error("stream init failed, please open console see more detail");
            console.error("init local stream failed ", err);
          })
        }, function(err) {
          Toast.error("client join failed, please open console see more detail");
          console.error("client join failed", err);
        })
      }, (err) => {
        Toast.error("client init failed, please open console see more detail");
        console.error(err);
      });
    })
  }

  publish () {
    if (!this._client) {
      Toast.error("Please Join First");
      return;
    }
    if (this._published) {
      Toast.error("Your already published");
      return;
    }
    const oldState = this._published;
    this._localStream.muteAudio();
    // publish localStream
    this._client.publish(this._localStream, (err) => {
      this._published = oldState;
      console.log("publish failed");
      Toast.error("publish failed");
      console.error(err);
    })
    Toast.info("publish");
    this._published = true;
  }

  unpublish () {
    if (!this._client) {
      Toast.error("Please Join First");
      return;
    }
    if (!this._published) {
      Toast.error("Your didn't publish");
      return;
    }
    const oldState = this._published;
    this._client.unpublish(this._localStream, (err) => {
      this._published = oldState;
      console.log("unpublish failed");
      Toast.error("unpublish failed")
      console.error(err);
    });
    Toast.info("unpublish");
    this._published = false;
  }

  leave () {
    if (!this._client) {
      Toast.error("Please Join First!");
      return;
    }
    if (!this._joined) {
      Toast.error("You are not in channel");
      return;
    }
    // leave channel
    this._client.leave(() => {
      // close stream
      this._localStream.close();

      $("#local_video_info").addClass("hide");
      // stop stream
      this._localStream.stop();
      while (this._remoteStreams.length > 0) {
        const stream = this._remoteStreams.shift();
        const id = stream.getId()
        stream.stop();
        removeView(id);
      }
      $("#local_stream").html('')
      this._localStream = null;
      this._remoteStreams = [];
      console.log("client leaves channel success");
      this._published = false;
      this._joined = false;
      Toast.notice("leave success")
    }, (err) => {
      console.log("channel leave failed");
      Toast.error("leave success");
      console.error(err);
    })
  }

  _getLostRate (lostPackets, arrivedPackets) {
    let lost = lostPackets ? +lostPackets : 0;
    let arrived = arrivedPackets ? +arrivedPackets : 0;
    if (arrived == 0) return 0;
    const result = (lost / (lost + arrived)).toFixed(2) * 100
    return result;
  }

  _updateVideoInfo () {
    this._localStream && this._localStream.getStats((stats) => {
      const localStreamProfile = [
        ['Uid: ', this._localStream.getId()].join(''),
        ['SDN access delay: ', stats.accessDelay, 'ms'].join(''),
        ['Video send: ', stats.videoSendFrameRate, 'fps ', stats.videoSendResolutionWidth + 'x' + stats.videoSendResolutionHeight].join(''),
      ].join('<br/>');
      $("#local_video_info")[0].innerHTML = localStreamProfile;
    })

    if (this._remoteStreams.length > 0) {
      for (let remoteStream of this._remoteStreams) {
        remoteStream.getStats((stats) => {
          const remoteStreamProfile = [
            ['Uid: ', remoteStream.getId()].join(''),
            ['SDN access delay: ', stats.accessDelay, 'ms'].join(''),
            ['End to end delay: ', stats.endToEndDelay, 'ms'].join(''),
            ['Video recv: ', stats.videoReceiveFrameRate, 'fps ', stats.videoReceiveResolutionWidth + 'x' + stats.videoReceiveResolutionHeight].join(''),
          ].join('<br/>');
          if ($("#remote_video_info_"+remoteStream.getId())[0]) {
            $("#remote_video_info_"+remoteStream.getId())[0].innerHTML = remoteStreamProfile;
          }
        })
      }
    }
  }

  setNetworkQualityAndStreamStats (enable) {
    this._showProfile = enable;
    this._showProfile ? $(".video-profile").removeClass("hide") : $(".video-profile").addClass("hide")
  }
}


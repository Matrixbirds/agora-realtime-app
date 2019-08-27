import RTCClient from './rtc-client';
import {getDevices, serializeFormData, validator, resolutions} from './common';
import "./assets/style.scss";
import {Toast} from './common';
import * as M from 'materialize-css';
import {setFormData, parseFromSearch} from './searchParam';
import RtmClient from './rtm-client';

let role = "audience"

const appID = 'agora appid'

const rtmClient = new RtmClient(appID);

window.rtmClient = rtmClient
window.rtc = rtmClient._rtc;
$(() => {
  rtmClient.on('ChannelMessage', ({name, message, memberId}) => {
    this._bus.emit("ChannelMessage", {name, message, memberId});
  })
  rtmClient.on("MemberJoined", ({name, memberId}) => {
    Toast.info(`MemberJoined name: ${name}, memberId: ${memberId}`)
  })
  rtmClient.on("MemberLeft", ({name, memberId}) => {
    Toast.info(`MemberLeft name: ${name}, memberId: ${memberId}`)
  })
  rtmClient.on('MessageFromPeer', (message, peerId) => {
    console.log("MessageFromPeer ", message, peerId);
  })
  rtmClient.on("RemoteInvitationAccepted", ({callerId, response}) => {
    console.log("RemoteInvitationAccepted", callerId, response);
  });
  rtmClient.on("RemoteInvitationCanceled", ({callerId}) => {
    console.log("RemoteInvitationCanceled", callerId);
  });
  rtmClient.on("RemoteInvitationFailure", ({callerId, reason}) => {
    console.log("RemoteInvitationFailure", callerId, reason);
  });
  rtmClient.on("RemoteInvitationRefused", ({callerId}) => {
    console.log("RemoteInvitationRefused", callerId);
  });
  rtmClient.on("LocalInvitationAccepted", ({calleeId, response}) => {
    console.log("LocalInvitationAccepted", calleeId);
  });
  rtmClient.on("LocalInvitationFailure", ({calleeId, reason}) => {
    console.log("LocalInvitationFailure", calleeId, reason);
  });
  rtmClient.on("LocalInvitationRefused", ({calleeId, response}) => {
    console.log("LocalInvitationRefused", calleeId, response);
  });
  rtmClient.on("LocalInvitationCanceled", ({calleeId}) => {
    console.log("LocalInvitationCanceled", calleeId);
  });
  rtmClient.on("LocalInvitationReceivedByPeer", ({calleeId}) => {
    console.log("LocalInvitationReceivedByPeer", calleeId);
  });
  rtmClient.on("RemoteInvitationReceived", (remoteInvitation) => {
    rtmClient.remoteInvitations = remoteInvitation;
    console.log("RemoteInvitationReceived", remoteInvitation);
  })
  rtmClient.on("ConnectionStateChanged", (state, reason) => {
    console.log('state', state, 'reason', reason);
  })
  rtmClient.on("MessageFromPeer", (message, peerId, messageProperties) => {
    console.log('message', message, 'peerId', peerId, 'messageProperties', messageProperties);
  })

  $("#login").on("click", async function (e) {
    // 阻止表单提交
    e.preventDefault();
    const formData = serializeFormData("#content");
    if (!validator(formData, ['account', 'channel'])) {
      return;
    }
    // 登录&加入rtm频道
    await rtmClient.login(formData.account);
    await rtmClient.joinChannel(formData.channel)
    $("#role").text(role);
  })

  $("#logout").on("click", async function (e) {
    // 阻止表单提交
    e.preventDefault();
    const formData = serializeFormData("#content");
    if (!validator(formData, ['account', 'channel'])) {
      return ;
    }
    await rtmClient.leaveChannel(formData.channel);
    await rtmClient.logout();
    $("#role").text('');
  })

  $("body").on("click", ".muteVideo", (e) => {
    e.preventDefault();
    const uid = $(e.target).attr('data-uid');
    console.log('uid', uid);
  })

  $("body").on("click", ".muteAudio", (e) => {
    e.preventDefault();
    const uid = $(e.target).attr('data-uid');
    console.log('uid', uid);
  })

  $(".kick").on("click", (e) => {
    e.preventDefault();
    const uid = $(e.target).attr('data-uid');
    console.log('uid', uid);
  })

  $("#teacher").on("change", (e) => {
    e.preventDefault();
    role = role == 'audience' ? 'host' : 'audience';
    console.log("change role ", role);
  })
  getDevices(function (devices) {
    devices.audios.forEach(function (audio) {
      $('<option/>', {
        value: audio.value,
        text: audio.name,
      }).appendTo("#microphoneId");
    })
    devices.videos.forEach(function (video) {
      $('<option/>', {
        value: video.value,
        text: video.name,
      }).appendTo("#cameraId");
    })
    resolutions.forEach(function (resolution) {
      $('<option/>', {
        value: resolution.value,
        text: resolution.name
      }).appendTo("#cameraResolution");
    })
    M.AutoInit();
  })
})
$(window).on("unload", () => {
  rtmClient.logout().then(() => {
    console.log("logout >>>>>")
  });
})

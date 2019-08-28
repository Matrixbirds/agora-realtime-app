import {getDevices, serializeFormData, validator, resolutions} from './common';
import "./assets/style.scss";
import {Toast} from './common';
import * as M from 'materialize-css';
import RtmClient from './rtm-client';

let role = "audience"

const appID = 'Agora.io appID'

const rtmClient = new RtmClient(appID);

window.rtmClient = rtmClient
window.rtc = rtmClient._rtc;
$(() => {
  rtmClient.on('ChannelMessage', async ({name, message, memberId}) => {
    const text = message.text
    const sync_data = text.match(/sync_data/);
    if (sync_data) {
      const payload = JSON.parse(text);
      const body = payload.body
      rtmClient.updateMemberByAccount(body);
    }
    console.log("name", name, "message", message.text, "memberId", memberId);
  })
  rtmClient.on("MemberJoined", ({name, memberId}) => {
    Toast.info(`MemberJoined name: ${name}, memberId: ${memberId}`)
  })
  rtmClient.on("MemberLeft", ({name, memberId}) => {
    rtmClient.removeMemberByAccount(memberId);
    Toast.info(`MemberLeft name: ${name}, memberId: ${memberId}`)
  })
  rtmClient.on('MessageFromPeer', (message, peerId) => {
    console.log("MessageFromPeer ", message, peerId);
  })
  rtmClient.on("RemoteInvitationAccepted", ({callerId}) => {
    console.log("已同意远程邀请", callerId);
  });
  rtmClient.on("RemoteInvitationFailure", ({callerId, reason}) => {
    console.log("RemoteInvitationFailure", callerId, reason);
  });
  // 学生同意老师邀请
  rtmClient.on("LocalInvitationAccepted", async ({calleeId, response}) => {
    if (rtmClient._role == 'host') {
      if (response.match(/answer_media/)) {
        const json = JSON.parse(response)
        const body = json.body;
        body.account = calleeId;
        await rtmClient.sendChannelMessage(rtmClient._currentChannelName, JSON.stringify({cmd: 'sync_data', body: body}));
      }
    }
  });
  rtmClient.on("LocalInvitationFailure", ({calleeId, reason}) => {
    console.log("LocalInvitationFailure", calleeId, reason);
  });
  rtmClient.on("LocalInvitationReceivedByPeer", ({calleeId}) => {
    console.log("邀请到达 ", calleeId);
  });
  // 学生端接受呼叫邀请屏蔽逻辑
  rtmClient.on("RemoteInvitationReceived", async (remoteInvitation) => {
    rtmClient.remoteInvitations = remoteInvitation;
    const resp = JSON.parse(remoteInvitation.content);
    const cmd = resp.cmd;
    const body = resp.body;
    if (cmd == 'offer_media') {
      console.log('RemoteInvitationReceived',resp);
      if (rtmClient._role == 'audience') {
        let res = await rtmClient.changeLocalStreamMedia(body);
        remoteInvitation.response = JSON.stringify({cmd: 'answer_media', body: res});
      }
      remoteInvitation.accept();
      console.log("收到远端邀请 ", remoteInvitation);
    }
    if (cmd == 'offer_fetch_data') {
      const channel = body.channel;
      let res = rtmClient.readStorageByChannel(channel);
      if (Object.keys(res).length > 0) {
        remoteInvitation.response = JSON.stringify({cmd: 'offer_fetch_data', body: res});
        remoteInvitation.accept();
      }
    }
  })
  // note: @care
  rtmClient.on("ConnectionStateChanged", async (state, reason) => {
    if (state == 'CONNECTED' && role != 'host') {
      await rtmClient.fetchFromHost();
    }
    console.log('state', state, 'reason', reason);
  })
  $("#login").on("click", async function (e) {
    // 阻止表单提交
    e.preventDefault();
    const formData = serializeFormData("#content");
    if (!validator(formData, ['account', 'channel'])) {
      return;
    }
    rtmClient.setRole(role);
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

  $("body").on("click", ".muteVideo", async (e) => {
    e.preventDefault();
    const account = $(e.target).attr('data-account');
    const uid = $(e.target).attr('data-uid');
    console.log("account", account, "uid", uid);
    if (role == 'host') {
      let peer = await rtmClient.findMember(account, uid);
      if (!peer) {
        Toast.info(`uid: ${uid} 已离开RTM`)
        return
      }
      console.log('peer', peer)
      await rtmClient.sendInvitation(peer.account,
        {cmd: "offer_media", body: {video: peer.video}
      })
    } else {
      Toast.error("当前用户不是Host角色，无权操作")
    }
  })

  $("body").on("click", ".muteAudio", async (e) => {
    e.preventDefault();
    const account = $(e.target).attr('data-account');
    const uid = $(e.target).attr('data-uid');
    console.log('account', account, 'uid', uid);
    if (role == 'host') {
      let peer = await rtmClient.findMember(account, uid);
      if (!peer) {
        Toast.info(`uid: ${uid} 已离开RTM`)
        return
      }
      console.log('peer', peer)
      await rtmClient.sendInvitation(peer.account,
        {cmd: "offer_media", body: {audio: peer.audio}
      })
    } else {
      Toast.error("当前用户不是Host角色，无权操作")
    }
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

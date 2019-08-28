import rtm from 'agora-rtm-sdk';
import EventEmitter from 'events';
import RTCClient from './rtc-client';
import {addView, removeView} from './common';

export default class RtmClient {
  constructor (appId) {
    this._appId = appId;
    this._rtm = rtm.createInstance(appId);
    this._rtc = new RTCClient();
    this.memberAttrs = [];
    this._state = null;
    this._channels = {};
    this._localInvitations = {};
    this._remoteInvitations = {};
    this._bus = new EventEmitter();
    this._account = null;
    this._currentChannelName = null;
    this._role = 'audience';
  }

  setRole(role) {
    this._role = role;
  }

  set memberAttrs (val) {
    this._memberAttrs = val;
    this.saveStorage();
  }

  get memberAttrs () {
    return this._memberAttrs;
  }

  // 从主播端同步数据
  async fetchFromHost() {
    let members = await this.fetchMembers();
    if (members) {
      const host = members.find(member => member.role == 'host');
      if (host && this._role != 'host') {
        await this.sendInvitation(host.account, {cmd: 'offer_fetch_data', body: {channel: this._currentChannelName}});
      }
    }
  }

  // note: @care
  // 还有个离线问题没处理
  saveStorage () {
    localStorage.setItem(this._currentChannelName, JSON.stringify(this._memberAttrs));
    console.log("storage", localStorage.getItem(this._currentChannelName))
  }

  readStorage () {
    let res = localStorage.getItem(this._currentChannelName);
    let json = JSON.parse(res);
    return json;
  }

  readStorageByChannel(name) {
    console.log("获取",name, "的频道信息");
    let res = localStorage.getItem(name) || {};
    let json = JSON.parse(res);
    return json;
  }

  static readStorage (channelName) {
    let res = localStorage.getItem(channelName);
    let json = JSON.parse(res);
    return json;
  }

  async changeLocalStreamMedia(mediaAttr) {
    const local = this.findMemberByLocal(this._account);
    let video = local ? local.video : "true";
    let audio = local ? local.audio : "true";
    if (mediaAttr.video) {
      if (mediaAttr.video === "true") {
        this._rtc.localStream.muteVideo();
        video = "false";
        console.log('mute视频')
      } else {
        this._rtc.localStream.unmuteVideo();
        video = "true";
        console.log('unmute视频')
      }
    }

    if (mediaAttr.audio) {
      if (mediaAttr.audio === "true") {
        this._rtc.localStream.muteAudio();
        audio = "false";
        console.log('mute音频')
      } else {
        this._rtc.localStream.unmuteAudio();
        audio = "true";
        console.log('unmute音频')
      }
    }

    await this.addOrUpdateLocalUserAttributes(video, audio);
    console.log("mediaAttr", mediaAttr, ` video, ${video}, audio: ${audio}`);
    return {
      video,
      audio
    }
  }

  changeLocalStreamScreenSharing() {

  }

  set remoteInvitations(val) {
    const callerId = val.callerId;
    this._remoteInvitations[callerId] = val;
    this._remoteInvitations[callerId].on("RemoteInvitationAccepted", () => {
      this._bus.emit("RemoteInvitationAccepted", {callerId});
    })
    this._remoteInvitations[callerId].on("RemoteInvitationCanceled", (content) => {
      this._bus.emit("RemoteInvitationCanceled", {callerId, content});
    })
    this._remoteInvitations[callerId].on("RemoteInvitationFailure", (reason) => {
      this._bus.emit("RemoteInvitationFailure", {callerId, reason});
    })
    this._remoteInvitations[callerId].on("RemoteInvitationRefused", () => {
      this._bus.emit("RemoteInvitationRefused", {callerId})
    })
  }

  async setLocalUserAttrs(name, account, uid, video, audio) {
    await this._rtm.setLocalUserAttributes({
        channel: `${name}`,
        account: `${account}`,
        uid: `${uid}`,
        role: `${this._role}`,
        video: `${video === true}`,
        audio: `${audio === true}`,
    });
  }

  async addOrUpdateLocalUserAttributes(video, audio) {
    await this._rtm.addOrUpdateLocalUserAttributes({
      audio,
      video
    })
    await this.fetchMembers();
  }

  async login (account) {
    let res = await this._rtm.login({uid: account});
    this._state = 'login'
    this._account = account
    return res;
  }

  async logout () {
    if (this._state == 'login') {
      let res = await this._rtm.logout();
      this._state = 'logout'
      return res;
    }
  }


  findMemberByLocal(account) {
    const local = this.readStorage();
    if (local) {
      let member = local.find((member) => member.account == account);
      return member;
    }
  }

  async findMember(account, uid) {
    const members = await this.fetchMembers();
    if (account) {
      return members
        .find((member) => member.account == account);
    }

    if (uid) {
      return members
        .find((member) => member.uid == uid);
    }
    
  }

  updateMemberByAccount(body) {
    const account = body.account;
    let local = this.readStorage();
    if (local) {
      for (let member of local) {
        if (member.account == account) {
          Object.assign(member, body);
        }
      }
      this.memberAttrs = local;
      console.log("updateMemberByAccount 执行成功>>>", this.memberAttrs)
      return true;
    } else {
      console.log("updateMemberByAccount 尚未执行>>>")
    }
  }

  removeMemberByAccount(account) {
    let local = this.readStorage();
    if (local) {
      this.memberAttrs = local.filter((member) => member.account != account);
      console.log("removeMemberByAccount 执行成功>>>", this.memberAttrs)
      return true;
    } else {
      console.log("removeMemberByAccount 尚未执行>>>")
    }
  }

  async fetchMembers () {
    const name = this._currentChannelName;
    const channelObj = this._channels[name];
    const map = [];
    if (this._state == 'login' && channelObj) {
      let res = await channelObj.channel.getMembers();
      const members = this._channels[name].members = res
      for (let account of members) {
        let res = await this._rtm.getUserAttributes(account);
        map.push(res);
      }
      this.memberAttrs = map;
      return map;
    }
  }

  on(eventName, evtCallback) {
    const events = [
      'LocalInvitationAccepted',
      'LocalInvitationFailure',
      'LocalInvitationCanceled',
      'LocalInvitationRefused',
      'LocalInvitationReceivedByPeer',
      'RemoteInvitationAccepted',
      'RemoteInvitationCanceled',
      'RemoteInvitationFailure',
      'RemoteInvitationRefused',
      'MemberJoined',
      'ChannelMessage',
      'MemberLeft'
    ];

    // 另处理邀请事件
    if (events.indexOf(eventName) != -1) {
      this._bus.on(eventName, evtCallback);
      return;
    }
    this._rtm.on(eventName, (evt) => {
      console.log("evt", evt);
      evtCallback(evt)
    });
  }

  async sendPeerMessage(message, account) {
    let res = await this._rtm.sendMessageToPeer({text: message},
      account, {enableOfflineMessaging: true});
    return res;
  }

  async joinChannel(name) {
    let channel = this._rtm.createChannel(name);
    channel.on('ChannelMessage', (message, memberId) => {
      this._bus.emit("ChannelMessage", {name, message, memberId});
    });
    channel.on('MemberJoined', (memberId) => {
      console.log("channel join")
      this._bus.emit("MemberJoined", {name, memberId});
    });
    channel.on('MemberLeft', (memberId) => {
      console.log("channel join")
      this._bus.emit("MemberLeft", {name, memberId});
    });
    let res = await channel.join();
    let members = await channel.getMembers();
    this._channels[name] = {
      channel: channel,
      members: members
    }
    const appID = this._appId;

    this._currentChannelName = name;
    // Occurs when the peer user leaves the channel; for example, the peer user calls Client.leave.
    this._rtc.on("peer-leave", (evt) => {
      const id = evt.uid;
      if (id != this._uid) {
        removeView(id);
      }
      // Toast.notice("peer leave")
      console.log('peer-leave', id);
    })
    this._rtc.on("stream-fallback", async (evt) => {
      const memberAttrs = await this.fetchMembers();
      console.log("memberAttrs", JSON.stringify(memberAttrs), " id", evt.stream.getId());
      const members = memberAttrs.filter(item => item.uid).map(item => +item.uid)
      const remoteStream = evt.stream;
      const id = remoteStream.getId();
      if (id !== this._uid && members.indexOf(id) != -1) {
        // Toast.info("subscribe uid: " + id)
        this._rtc.subscribe(remoteStream, (err) => {
          console.log("stream subscribe failed", err);
        })
      }
    });
    // Occurs when the local stream is _published.
    this._rtc.on("stream-published", async (evt) => {
      // Toast.notice("stream published success")
      const memberAttrs = await this.fetchMembers();
      console.log("memberAttrs", JSON.stringify(memberAttrs), " id", evt.stream.getId());
      const members = memberAttrs.filter(item => item.uid).map(item => +item.uid)
      const remoteStream = evt.stream;
      const id = remoteStream.getId();
      if (id !== this._uid && members.indexOf(id) != -1) {
        // Toast.info("subscribe uid: " + id)
        this._rtc.subscribe(remoteStream, (err) => {
          console.log("stream subscribe failed", err);
        })
      }
      console.log("stream-published");
    })
    // Occurs when the remote stream is added.
    this._rtc.on("stream-added", async (evt) => {
      console.log("stream-added stream ", evt.stream);
      const memberAttrs = await this.fetchMembers();
      const members = memberAttrs.filter(item => item.uid).map(item => +item.uid)
      const remoteStream = evt.stream;
      const id = remoteStream.getId();
      if (id !== this._uid && members.indexOf(id) != -1) {
        // Toast.info("subscribe uid: " + id)
        this._rtc.subscribe(remoteStream, (err) => {
          console.log("stream subscribe failed", err);
        })
      }
      console.log('stream-added remote-uid: ', id);
    });
    // Occurs when a user subscribes to a remote stream.
    this._rtc.on("stream-subscribed", async (evt) => {
      const remoteStream = evt.stream;
      const id = remoteStream.getId();
      this._rtc.remoteStreams.push(remoteStream);
      const memberAttrs = await this.fetchMembers();
      const member = memberAttrs.find(item => +item.uid === id);
      console.log("find caccount >> ", member.account);
      const account = member.account;
      addView(id, account);
      remoteStream.play("remote_video_" + id, {fit: "cover"});
      // Toast.info('stream-subscribed remote-uid: ' + id);
      console.log('stream-subscribed remote-uid: ', id);
    })
    // Occurs when the remote stream is removed; for example, a peer user calls Client.unpublish.
    this._rtc.on("stream-removed", (evt) => {
      const remoteStream = evt.stream;
      const id = remoteStream.getId();
      // Toast.info("stream-removed uid: " + id);
      remoteStream.stop();
      this._rtc.remoteStreams = this._rtc.remoteStreams.filter((stream) => {
        return stream.getId() !== id
      });
      removeView(id);
      console.log('stream-removed remote-uid: ', id);
    })
    this._rtc.on("onTokenPrivilegeWillExpire", () => {
      // After requesting a new token
      // this._rtc.renewToken(token);
      // Toast.info("onTokenPrivilegeWillExpire");
      console.log("onTokenPrivilegeWillExpire");
    });
    this._rtc.on("onTokenPrivilegeDidExpire", () => {
      // After requesting a new token
      // client.renewToken(token);
      Toast.info("onTokenPrivilegeDidExpire");
      console.log("onTokenPrivilegeDidExpire");
    })
    // note: @care
    this._rtc.on("connection-state-change", (evt) => {
      console.log("rtc.connection-state-change", evt.prevState, evt.curState);
    })

    let _uid = 0;
    let _video = true;
    let _audio = true;
    // 从缓存读取之前用户的信息
    const cache = this.readStorage()
    if (cache) {
      let me = cache.find((member) => member.account == this._account);

      if (me) {
        _uid = +me.uid
        _video = me.video === "true"
        _audio = me.audio === "true"
      }
    } else {
      console.log('没有从本地读到频道信息，届时重新创建');
    }

    let uid = await rtc.join({
      appID,
      channel: name,
      uid: _uid,
      mode: 'rtc',
      codec: 'h264',
      video: true,
      audio: true,
      _video,
      _audio
    }, this._account);
    this._rtc.on("error", (err) => {
      console.log(err)
    })
    await this.setLocalUserAttrs(name, this._account, uid, true, true);
    await this.fetchMembers();
    this._uid = uid;
    // let memberAttrs = await this.fetchMembers(name);
    // this.members = Object.values(memberAttrs).map(item => +item);
    await this._rtc.publish();
    return res;
  }

  async leaveChannel(name) {
    if (this._channels[name]) {
      await this._rtc.leave();
      return this._channels[name].channel.leave();
    }
  }

  async sendChannelMessage(name, message) {
    if (this._channels[name]) {
      let res = await this._channels[name]
        .channel.sendMessage({text: message});
      return res;
    }
  }

  async sendInvitation(calleeId, content) {
    this._localInvitations[calleeId] = this._rtm.createLocalInvitation(calleeId);
    this._localInvitations[calleeId].content = JSON.stringify(content);
    this._localInvitations[calleeId].on("LocalInvitationAccepted", (response) => {
      this._bus.emit("LocalInvitationAccepted", {calleeId, response})
      console.log("LocalInvitationAccepted", response)
    })
    this._localInvitations[calleeId].on("LocalInvitationFailure", (reason) => {
      this._bus.emit("LocalInvitationFailure", {calleeId, reason})
      console.log("LocalInvitationFailure", reason)
    })
    this._localInvitations[calleeId].on("LocalInvitationRefused", (response) => {
      this._bus.emit("LocalInvitationRefused", {calleeId, response})
      console.log("LocalInvitationRefused", response)
    })
    this._localInvitations[calleeId].on("LocalInvitationCanceled", () => {
      this._bus.emit("LocalInvitationCanceled", {calleeId})
      console.log("LocalInvitationCanceled")
    })
    this._localInvitations[calleeId].on("LocalInvitationReceivedByPeer", () => {
      this._bus.emit("LocalInvitationReceivedByPeer", {calleeId})
      console.log("LocalInvitationReceivedByPeer")
    })
    return this._localInvitations[calleeId].send();
  }

  async cancelInvitation(calleeId) {
    if (this._localInvitations[calleeId]) {
      return this._localInvitations[calleeId].send();
    }
  }

  async refuseInvitation(callerId) {
    if (this._remoteInvitations[callerId]) {
      return this._remoteInvitations[callerId].refuse();
    }
  }

  async acceptInvitation() {
    if (this._remoteInvitations[callerId]) {
      return this._remoteInvitations[callerId].accept();
    }
  }
}
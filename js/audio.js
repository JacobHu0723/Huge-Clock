//添加歌曲需改动：list，切歌的最大值3个，共4处
var list=new Array("files/rain.mp3","files/meditation.mp3","files/Wait on the Lord.mp3","files/YanDaiXieJie.mp3");  //添加歌曲需要改这里！
var n=0;

var music = new Audio("files/rain.mp3");music.loop = true;
var tem = false  //设置一个变量，用来控制音乐是否在播放。

//var x = document.getElementById("music");  //把上下箭头控制音量顺便做这了
var vol = music.volume;
function upvolume() {
	vol = music.volume;
	music.volume = vol + 0.05;
	vol = music.volume;
	return vol;
};
function downvolume() {
	vol = music.volume;
	music.volume = vol - 0.05;
	vol = music.volume;
	return vol;
};

//定义一个函数，当用户单击的时候触发这个函数，从而实现音乐的暂停与播放。
function musiccc(){
	//tem用来控制音乐当前是否在播放。true代表音乐正在播放，false代表音乐当前正在处于暂停的状态。
	if(tem == false){
		music.play()  //播放音乐
		tem = true  
	}else{
		music.pause()  //暂停音乐
		tem = false
	}
}

function getKeyCode(e) {
var keyCode = 0;
var e = e || window.event;

if (e.keyCode=="37"  && n>=0) {
  if (n>0) n = n - 1;
  else n=3;  //添加歌曲需要改这里！
  music.pause();
  music = new Audio(list[n]);music.loop = true;
  music.volume = vol;
  if (tem == true) music.play();
};

if (e.keyCode=="39" && n<=3) {  //添加歌曲需要改这里！
  if (n<3) n = n + 1;  //添加歌曲需要改这里！
  else n=0;
  music.pause();
  music = new Audio(list[n]);music.loop = true;
  music.volume = vol;
  if (tem == true) music.play();
};

if (e.keyCode=="32") {  //空格暂停
	if(tem == false){
		music.play()  //播放音乐
		tem = true  
	}else{
		music.pause()  //暂停音乐
		tem = false
	}
};

if (e.keyCode=="38") {  //上箭头增加音量也做这了
  upvolume();
};

if (e.keyCode=="40") {  //下箭头减小音量也做这了
  downvolume();
};

if (e.keyCode=="13") {  //回车全屏做这了
Fullscreen(document)
};
}

var scrollFunc = function(e) {
	var e = e || window.event;
	if(e.wheelDelta){
		if(e.wheelDelta > 0) {     //当鼠标滚轮向上滚动时
	upvolume();
		};
		if(e.wheelDelta < 0) {     //当鼠标滚轮向下滚动时
	downvolume();
		};
	};}

//给页面绑定鼠标滚轮事件,针对火狐的非标准事件 
window.addEventListener("DOMMouseScroll", scrollFunc)
//给页面绑定鼠标滚轮事件，针对Google，mousewheel非标准事件已被弃用，请使用 wheel事件代替
window.addEventListener("wheel", scrollFunc)
//ie不支持wheel事件，若一定要兼容，可使用mousewheel
window.addEventListener("mousewheel", scrollFunc)
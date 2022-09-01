var x = document.getElementById("music");
var vol = x.volume;

function upvolume() {
	vol = x.volume;
	x.volume = vol + 0.1;
};
function downvolume() {
	vol = x.volume;
	x.volume = vol - 0.1;
};

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
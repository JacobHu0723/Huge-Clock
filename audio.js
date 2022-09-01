var music = document.getElementById('music')    //获取音乐
var tem = false  //设置一个变量，用来控制音乐是否在播放。

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
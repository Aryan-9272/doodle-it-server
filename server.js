const express=require('express');
const app=express();
const server=require('http').createServer(app);
const io=require('socket.io')(server,{
  cors:{
    origin:"*"
  }
});

const PORT = process.env.PORT || 5000;

io.on("connection",(socket)=>{
    console.log('Client connected with socket id : ',socket.id);
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
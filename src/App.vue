<script setup lang="ts">
// 1. 引入你之前创建的布局组件
import Main from './views/Main.vue'
</script>

<template>
  <Main />
</template>

<style>
/* 注意：这里去掉 scoped，或者在 main.css 中设置，
   确保 html 和 body 撑满屏幕，否则 Grid 布局无法撑开高度 
*/
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}
</style>

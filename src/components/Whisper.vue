<!-- src/views/Whisper.vue -->
<script lang="ts" setup>
import { transcribeAudio } from '@/services/whisperService';
import type { OutputType } from '@/services/whisperService';
import { reactive, ref, onMounted, nextTick, computed } from 'vue';
import { isMobile } from '@/utils/agent'
import { message, px2remTransformer } from 'ant-design-vue';
import dayjs from 'dayjs'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { useClipboard } from '@vueuse/core'
import { set,get } from 'idb-keyval';

const isMobileMedia = isMobile();
const innerHeight = ref(window.innerHeight + 'px')

onMounted(async () => {
  if (isRecordingMode.value) {
    await getRecordAccess()
  }
  const dom = document.querySelector('#recordBtnRef') as HTMLDivElement
  if (isMobile()) {
    dom?.addEventListener('touchstart', startRecording)
    dom?.addEventListener('touchend', stopRecording)
    dom?.addEventListener('touchmove', (e) => {
      e.preventDefault()
      handleTouchMove(e)
    })
  } else {
    dom?.addEventListener('mousedown', startRecording)
    dom?.addEventListener('mouseup', stopRecording)
  }
  window.addEventListener('resize', () => {
    innerHeight.value = window.innerHeight + 'px'
  })
  get('my-history').then((val)=>{
    console.log(val)
    messageHistory.value = val ? JSON.parse(val): []
  })
  .catch((err)=>{
    console.log(err)
    messageHistory.value = []
  })
  
});

/// <FFmpeg
const ffmpeg = new FFmpeg();
(async () => {
  const baseURL = window.location.origin;
  try {
    console.log(ffmpeg)
    ffmpeg.on('log', ({ message }) => {
      console.log(message);
    });
    // if (!ffmpeg.loaded) {
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      // workerURL:await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'application/wasm'),
      // wasmURL:'/ffmpeg-core.wasm',
      // coreURL:'/ffmpeg-core.js'
    });
    // }
    console.log(ffmpeg)

    await ffmpeg.exec(['-version']); // 运行一个简单的命令来检查 FFmpeg 是否正常工作
    console.log(ffmpeg)
  } catch (error) {
    console.error('Error initializing ffmpeg:', error);
  }
})();
/// FFmpeg>

enum MessageStatus {
  'recording', 'transforming', 'doing', 'done'
}

type Message = {
  id: Number,
  recordTime: String,
  mode: '实时' | '上传',
  status: MessageStatus,
  content: String,
  format?: OutputType,
  audio: typeof Audio,
  duration: Number,
  spendTime: String,
  offsetX: number,
  deleting: Boolean
}

const settingOpen = ref<Boolean>(false)
const messageHistory = ref<Message[]>([]);
const lastMessage = computed<Message>(() => {
  if (messageHistory.value.length > 0) {
    return messageHistory.value[messageHistory.value.length - 1]
  } else {
    return {}
  }
})

const baseData = {
  supportedLanguages: [
    '自动', 'zh', 'en', 'es', 'fr', 'de', 'ja', 'ko', 'ru', 'ar', 'hi', 'it', 'pt', 'nl', 'sv', 'fi', 'da', 'no', 'pl', 'tr',
  ],
  supportedFormat: [
    'txt', 'vtt', 'srt', 'tsv', 'json'
  ],
}
const asrSetting = reactive({
  encode: true,
  task: 'transcribe',
  language: '自动',
  initial_prompt: '',
  vad_filter: true,
  word_timestamps: false,
  output: 'txt',
})
const isRecordingMode = ref(true);
// 切换模式
const switchMode = async () => {
  isRecordingMode.value = !isRecordingMode.value;
  if (isRecordingMode.value) {
    await getRecordAccess()
  }
}

const mediaRecorder = ref<MediaRecorder>();
const audioChunks = ref([]);
const stream = ref<MediaStream>(); // MediaRecorder实例
async function getRecordAccess() {
  if (stream.value) {
    return
  }
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({ audio: true });
    // 用户授予权限后，可以在这里创建MediaRecorder实例
    // 但是不要开始录音，除非用户点击了录音按钮
  } catch (err) {
    console.error('Cannot access media devices:', err);
  }
}
const isRecording = ref(false);
const startX = ref(0);
let stopType: 'stop' | 'cancel' | '' = ''
const threshold = 100; // 左右滑动特殊操作的阈值


const historyAreaRef = ref<HTMLDivElement>()
const historyWrapRef = ref<HTMLDivElement>()
const recordStartTime = ref(0)
function scrollToDown() {
  nextTick(() => {
    historyWrapRef.value?.scrollTo({ top: historyAreaRef.value.clientHeight })
  })
}

const startRecording = async (event) => {
  recordStartTime.value = new Date().getTime()
  if (!navigator.mediaDevices) {
    console.error('MediaDevices API not supported.');
    alert('MediaDevices API not supported.')
    return;
  }
  isRecording.value = true;
  startX.value = event.type === 'mousedown' ? event.clientX : event.touches[0].clientX;
  scrollToDown()
  try {
    mediaRecorder.value = new MediaRecorder(stream.value);
    messageHistory.value.push({
      id: messageHistory.value.length + 1,
      recordTime: dayjs(new Date()).format("YYYY-MM-DD HH:mm:ss"),
      mode: '实时',
      audio: null,
      status: MessageStatus.recording,
      content: '',
      format: asrSetting.output,
      deleting: false,
      offsetX: 0
    })



    mediaRecorder.value.ondataavailable = (event) => {
      audioChunks.value.push(event.data);
    };

    mediaRecorder.value.onstop = () => {
      if (stopType === 'cancel') {
        audioChunks.value = [];
        stopType = ''
        return
      }

      stopType = ''
      const audioBlob = new Blob(audioChunks.value, { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      const item = messageHistory.value[messageHistory.value.length - 1]

      item.status = MessageStatus.doing

      // 清空 chunks 以便下次录音
      audioChunks.value = [];

      let startTime = new Date();
      let timeInterval = setInterval(() => {
        item.spendTime = dayjs().hour(0).minute(0).second(0).millisecond(new Date().getTime() - startTime.getTime()).format("mm:ss.SSS")
      }, 100)

      requestWithBlob(audioBlob).then(text => {
        clearInterval(timeInterval)
        item.audio = audio
        item.content = text
        item.status = MessageStatus.done
        item.url = audioUrl;
        scrollToDown()
        save2DB()
      })
    };

    mediaRecorder.value.start();
  } catch (err) {
    console.error('Could not start recording:', err);
  }
};

const stopRecording = (event: MouseEvent | TouchEvent) => {
  showTip.value = false;
  if (!isRecording.value) return;

  const xOffset = event.type === 'mouseup' ? event.clientX : event.changedTouches[0].clientX;

  // 向右滑动触发取消操作
  if (xOffset - startX.value > threshold) {
    handleRecordingCancel();
    mainBtnSizeStyle.transform = 'scale(1)'
    mainBtnSizeStyle.opacity = 1
    // 离得越远，
    return
  }
  // 向左滑动进入持续记录模式
  if (startX.value - xOffset > threshold) {

    return
  }

  if (new Date().getTime() - recordStartTime.value < 1000) {
    // 1s内松手就取消录制
    handleRecordingCancel()
    message.info("录音太短")
    return
  }


  stopType = 'stop'
  if (mediaRecorder.value && mediaRecorder.value.state === 'recording') {
    mediaRecorder.value.stop();
  }
  isRecording.value = false;
};

const showTip = ref(false)

const mainBtnSizeStyle = reactive({
  transform: 'scale(1)',
  opacity: 1
})
const leftBtnFontStyle = reactive({
  transform: 'scale(1)',
  opacity: 0.4
})
const rightBtnFontStyle = reactive({
  transform: 'scale(1)',
  opacity: 0.4
})

const handleTouchMove = (event) => {
  if (!isRecording.value) return;

  const xOffset = event.touches[0].clientX;
  let distance = Math.abs(xOffset - startX.value)
  // 设置安全区域
  if (distance < 36) {
    showTip.value = false
    mainBtnSizeStyle.transform = 'scale(1)'
    mainBtnSizeStyle.opacity = 1
  } else {
    // showTip.value = true
    let w = (threshold - distance) / threshold + 0.64
    if (w < 0.64) w = 0.64
    if (w > 1) w = 1
    showTip.value = true
    nextTick(() => {
      mainBtnSizeStyle.transform = `scale(${w})`
      mainBtnSizeStyle.opacity = w
      if (xOffset - startX.value > 0.4 * threshold) {
        rightBtnFontStyle.transform = `scale(${2 - w})`
        rightBtnFontStyle.opacity = Math.min(0.4 + 1 - w, 1)
      }
      if (xOffset - startX.value < -0.4 * threshold) {
        leftBtnFontStyle.transform = `scale(${2 - w})`
        leftBtnFontStyle.opacity = Math.min(0.4 + 1 - w, 1)
      }
    })

  }
};

const handleRecordingCancel = () => {
  stopType = 'cancel'
  if (mediaRecorder.value && mediaRecorder.value.state === 'recording') {
    mediaRecorder.value.stop();
  }
  isRecording.value = false;
  messageHistory.value.splice(messageHistory.value.length - 1, 1)
  console.log('Recording cancelled');
  // 可以在这里处理取消录音后的逻辑，比如删除已经录制的音频片段等
};

const beforeUpload = async (file: File) => {
  console.log(file, 'file')
  const newItem = {
    id: messageHistory.value.length + 1,
    recordTime: dayjs(new Date()).format("YYYY-MM-DD HH:mm:ss"),
    mode: '上传',
    audio: null,
    status: MessageStatus.doing,
    content: '',
    format: asrSetting.output,
    deleting: false,
    offsetX: 0
  }
  messageHistory.value.push(newItem)
  
  const item = messageHistory.value[messageHistory.value.length - 1];
  debugger
  if (file.type === 'audio/x-m4a') {
    item.status = MessageStatus.transforming
    ffmpeg.writeFile(file.name, await fetchFile(file));
    console.log(ffmpeg)
    await ffmpeg.exec(['-i', file.name, 'output.wav']);
    const wavData = await ffmpeg.readFile('output.wav');
    item.status = MessageStatus.doing
    const wavBlob = new Blob([(wavData as Uint8Array).buffer], { type: 'audio/wav' });
    requestWithBlob(wavBlob).then(text => {
      item.content = text;
      item.status = MessageStatus.done;
      scrollToDown()
      save2DB()
    })
    return
  }
  let startTime = new Date();
  let timeInterval = setInterval(() => {
    item.spendTime = dayjs().hour(0).minute(0).second(0).millisecond(new Date().getTime() - startTime.getTime()).format("mm:ss.SSS")
  }, 100)
  requestWithFile(file).then(text => {
    clearInterval(timeInterval)
    item.content = text;
    item.status = MessageStatus.done;
    scrollToDown()
  })

  return false; // 阻止组件默认上传行为
};

const requestWithFile = async (file) => {
  try {
    let formData = new FormData();
    formData.append('audio_file', file);
    let setting = { ...asrSetting }
    if (setting.language === '自动') {
      delete setting.language
    }
    // Call the Whisper API for audio transcription
    const result = await transcribeAudio(setting, formData);
    console.log('Transcription result:', result);
    return result
    // TODO: Handle the result as needed
  } catch (error) {
    console.error('Error transcribing audio:', error);
  }
}

const requestWithBlob = async (blob: Blob) => {
  let file = new File([blob], 'temp.wav')
  return await requestWithFile(file);
}



/// CARD 
const cardTouch = reactive({
  touchStartX: 0,
  touchMoveX: 0,
  isTouching: false
})

const handleCardTouchStart = (event: TouchEvent, index) => {
  console.log(event)
  cardTouch.touchStartX = event.touches[0].clientX
  cardTouch.isTouching = true
  messageHistory.value[index].offsetX = 0
}
const handleCardTouchMove = (event: TouchEvent, index) => {
  console.log(event)
  cardTouch.touchMoveX = event.touches[0].clientX
  const delta = cardTouch.touchMoveX - cardTouch.touchStartX
  if (delta > 0) {
    messageHistory.value[index].offsetX = delta;
  }
}
const innnerWidth = window.innerWidth
const handleCardTouchEnd = (event: TouchEvent, index: number) => {
  console.log(event)
  if (!cardTouch.isTouching) {
    return
  }
  cardTouch.isTouching = false
  // 滑动距离超过50px，则触发删除操作
  if (messageHistory.value[index].offsetX >= innnerWidth / 3) {
    messageHistory.value[index].deleting = true
    messageHistory.value[index].offsetX = innnerWidth
    setTimeout(() => {
      deleteCardItem(index)
    }, 200)
  } else {
    messageHistory.value[index].deleting = true
    messageHistory.value[index].offsetX = 0;
    setTimeout(() => {
      messageHistory.value[index].deleting = false
    }, 200)
  }
}
const deleteCardItem = (index: number) => {
  // 触发删除操作
  messageHistory.value.splice(index, 1); // 删除项
  save2DB()
}

const source = ref('')
const { copy } = useClipboard({ source })
const copyContent = (message: Message) => {
  source.value = message.content;
  copy();
}

const downloadFile = (message: Message) => {
  // 创建一个新的Blob对象，类型设定为text/plain
  var blob = new Blob([message.content], { type: 'text/plain' });
  // 创建一个指向该Blob的URL
  var url = window.URL.createObjectURL(blob);
  // 创建一个a标签
  var a = document.createElement('a');
  // 设置a标签的下载属性
  a.download = message.recordTime + "." + message.format;
  // 设置a标签的href属性为Blob对象的URL
  a.href = url;
  // 将a标签添加到页面中
  document.body.appendChild(a);
  // 触发a标签的点击事件，开始下载
  a.click();
  // 下载完成后，清理并移除a标签
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}


/// CARD 

let save2DB = ()=>{
  debugger
  set('my-history',JSON.stringify(messageHistory.value)).then(()=>{
    console.log("存储成功")
  })
}


import { AudioOutlined, UploadOutlined, StopOutlined, LockOutlined, CloseCircleFilled } from '@ant-design/icons-vue'
</script>

<template>
  <div :style="{ height: innerHeight }">

    <!-- 记录区域 -->
    <div class="overflow-y-auto history" ref="historyWrapRef">
      <div class="min-h-full p-4 space-y-2 bg-gray-300 flex justify-end flex-col overflow-x-hidden" ref="historyAreaRef">
        <div v-for="(message, index) in messageHistory" :key="message.id" class="flex justify-end ">
          <a-card class="max-w-md w-full rounded-lg bg-blue-200" :title="message.recordTime"
            :style="{ transform: `translateX(${message.offsetX}px)` }" :class="{ 'card-delete-ani': message.deleting }"
            @touchstart="handleCardTouchStart($event, index)" @touchmove="handleCardTouchMove($event, index)"
            @touchend="handleCardTouchEnd($event, index)">
            <template #extra>
              <!-- <a-tag color="blue">{{ message.mode }}</a-tag> -->
              <a-button v-if="!isMobileMedia" class="absolute right-[-40px] top-[-30px]" type="text"
                @click="deleteCardItem(index)">
                <CloseCircleFilled color="red" class="text-red-600 text-xl" />
              </a-button>
            </template>
            <div class="pt-1 text-lg">
              <p v-if="message.status === MessageStatus.recording">录制中...</p>
              <p v-if="message.status === MessageStatus.transforming">转码中...</p>
              <p v-if="message.status === MessageStatus.doing">识别中...{{ message.spendTime }}</p>

            </div>
            <div v-if="message.status === MessageStatus.done">

              <div class="text-lg font-bold mt-1 mb-1 flex justify-between">
                <span>识别内容：</span>
                <a-space>
                  <a-button type="primary" size="small" @click="downloadFile(message)">下载</a-button>
                  <a-button type="primary" size="small" @click="copyContent(message)">复制</a-button>
                </a-space>
              </div>
              <p class="m-0 pl-2" v-for="line in message.content.split('\n')">{{ line }}</p>
              <!-- <audio controls :src="message.url"></audio> -->
            </div>
          </a-card>
        </div>
      </div>
    </div>
    <!-- 发送/上传区域 -->
    <div class="shrink-0 p-4 border-t border-gray-200 select-none h-36 fixed bottom-0 left-0 w-full bg-white z-20">
      <div v-show="isRecordingMode" class="flex justify-center items-center h-20 relative z-50">
        <!-- 录制按钮 -->
        <a-button type="primary" shape="circle" style="height: 72px;width:72px;" id="recordBtnRef"
          :style="mainBtnSizeStyle" class="z-20">
          <!--  @mousedown="startRecording"
            @mouseup="stopRecording" 
            @touchstart="startRecording"
            @touchend="stopRecording" 
            @touchmove.prevent="handleTouchMove"  -->
          <AudioOutlined :style="{ fontSize: '48px', color: isRecording ? null : 'white', userSelect: 'none' }" />
          <!-- {{isRecording?'释放结束':'按住说话'}} -->
        </a-button>
        <div class="ring z-10" v-show="isRecording && !showTip"></div>
      </div>
      <div v-show="!isRecordingMode" class="flex justify-center items-center  h-20">
        <!-- 文件上传 -->
        <!-- accept="audio/*,video/*" -->
        <a-upload :beforeUpload="beforeUpload" :showUploadList="false"
          accept=".webm,.opus,.oga,.wma,.flac,.weba,.m4a,.wav,.ogg,.mp3,.ogm,.wmv,.mpg,.webm,.ogv,.mov,.asx">
          <a-button class="!h-16" type="primary">
            <UploadOutlined />上传文件(音频、视频均可)
          </a-button>
        </a-upload>
      </div>
      <div class="float-right ">
        <a-button type="text" @click="switchMode">切换模式</a-button>
        <a-button type="text" @click="settingOpen = true">高级设置</a-button>
      </div>
      <div class="flex flex-col h-full w-full bg-slate-500 fixed top-0 left-0 z-20 p-4" v-show="isRecording">
        <a-card class="flex-1 w-full rounded-lg bg-blue-200 " :title="lastMessage.recordTime">
          <template #extra>

            <a-tag color="blue">{{ lastMessage.mode }}</a-tag>
          </template>
          <div class="pt-1 text-lg">
            <p v-if="lastMessage.status === MessageStatus.recording">录制中...</p>
            <p v-if="lastMessage.status === MessageStatus.transforming">转码中...</p>
            <p v-if="lastMessage.status === MessageStatus.doing">识别中...</p>

          </div>
        </a-card>
        <div class="shrink-0  h-36 w-full">
          <div class="tip-icon left-8" :style="leftBtnFontStyle">
            <LockOutlined :style="{ fontSize: '32px' }" />
          </div>
          <div class="tip-icon right-8" :style="rightBtnFontStyle">
            <StopOutlined :style="{ fontSize: '32px' }" />
          </div>
        </div>
      </div>
    </div>


    <!-- Optional Parameters Section -->
    <a-drawer v-model:open="settingOpen" title="高级配置" placement="right">
      <a-form :labelCol="5">
        <a-form-item label="执行任务">
          <!-- Task Dropdown -->
          <a-select v-model:value="asrSetting.task" style="width: 200px; margin-bottom: 16px;">
            <a-select-option value="transcribe">语音转文字</a-select-option>
            <a-select-option value="translate">语音翻译到指定语言</a-select-option>
          </a-select>
        </a-form-item>


        <a-form-item label="目标语言">
          <!-- Language Dropdown -->
          <a-select v-model:value="asrSetting.language" style="width: 200px; margin-bottom: 16px;">
            <a-select-option v-for="lang in baseData.supportedLanguages" :key="lang" :value="lang">{{ lang
            }}</a-select-option>
          </a-select>
        </a-form-item>


        <a-form-item label="前置提示词">
          <!-- Initial Prompt Input -->
          <a-input v-model:value="asrSetting.initial_prompt" placeholder="Initial Prompt"
            style="width: 200px; margin-bottom: 16px;" />
        </a-form-item>


        <a-form-item label="是否启用VAD">
          <!-- VAD Filter Checkbox -->
          <a-checkbox v-model:checked="asrSetting.vad_filter">Enable VAD Filter</a-checkbox>
        </a-form-item>

        <!-- Word Timestamps Checkbox -->
        <!-- <a-form-item label="时间戳">
                    <a-checkbox v-model="wordTimestamps">Word Timestamps</a-checkbox>
                </a-form-item> -->

        <a-form-item label="输出格式">
          <!-- Output Format Dropdown -->
          <a-select v-model:value="asrSetting.output" style="width: 200px; margin-bottom: 16px;">
            <a-select-option v-for="format in baseData.supportedFormat" :key="format" :value="format">
              {{ format }}
            </a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-drawer>
  </div>
</template>

  
<style >
/* Add your custom styles here */
@keyframes scale-toggle {
  0% {
    transform: scale(1);
  }

  25% {
    transform: scale(0.8);
  }

  50% {
    transform: scale(1);
  }

  75% {
    transform: scale(1.2);
  }

  100% {
    transform: scale(1);
  }
}

@keyframes spread {
  0% {
    transform: scale(0.9);
    opacity: 1;
  }

  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.ring {
  width: 72px;
  height: 72px;
  border: 3px solid #3498db;
  border-radius: 50%;
  position: absolute;
  top: calc(50% - 36px);
  left: calc(50% - 36px);
  animation: spread 1.5s infinite;
  animation-timing-function: ease-out;
}

.history {
  height: calc(100% - theme('height.36'));
}

.my-container {
  /* @apply(h-screen) */
  height: 100vh;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}

.record-btn-ani {
  animation-name: scale-toggle;
  animation-duration: .7s;
  animation-delay: 0;
  animation-iteration-count: infinite;
  animation-timing-function: linear;
}

.tip-icon {
  @apply absolute bottom-[4.5rem] h-12 w-12 text-white rounded-full bg-red-300 flex items-center justify-center
}

.tip-icon:hover {
  border: 2px solid red;
}

.ant-card-body {
  padding-top: 0px !important;
}

.card-delete-ani {
  transition: transform .2s ease-in-out;
}

.ant-card-head-title {}

.ant-card-head {}
</style>
  
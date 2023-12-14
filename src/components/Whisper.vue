<!-- src/views/Whisper.vue -->
<script lang="ts" setup>
import { transcribeAudio } from '@/services/whisperService';
import type { OutputType } from '@/services/whisperService';
import { reactive, ref, onMounted, nextTick } from 'vue';
import { AudioOutlined, UploadOutlined, StopOutlined, LockOutlined } from '@ant-design/icons-vue'
import { isMobile } from '@/utils/agent'
import { message, px2remTransformer } from 'ant-design-vue';
import dayjs from 'dayjs'

enum MessageStatus {
  'recording', 'doing', 'done'
}

type Message = {
  id: Number,
  recordTime: String,
  mode: '实时' | '上传',
  status: MessageStatus,
  content: String,
  format?: OutputType,
  audio: typeof Audio,
  duration: Number
}

const settingOpen = ref<Boolean>(false)
const messageHistory = ref<Message[]>([]);
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
      format: asrSetting.output
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

      // 暂时下载音频文件
      // const u = URL.createObjectURL(audioBlob)
      // const a = document.createElement('a')
      // a.download = 'a.wav';
      // a.href = u;
      // a.click()
      // URL.revokeObjectURL(u)

      requestWithBlob(audioBlob).then(text => {
        item.audio = audio
        item.content = text
        item.status = MessageStatus.done
        item.url = audioUrl;
        scrollToDown()
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
  if ( xOffset - startX.value > threshold ) {
    handleRecordingCancel();
    mainBtnSizeStyle.transform = 'scale(1)'
    mainBtnSizeStyle.opacity = 1
    // 离得越远，
    return
  }
  // 向左滑动进入持续记录模式
  if ( startX.value - xOffset > threshold ) {
    
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
  if ( distance < 36){
    showTip.value = false
    mainBtnSizeStyle.transform = 'scale(1)'
    mainBtnSizeStyle.opacity = 1
  }else{
    // showTip.value = true
    let w = (threshold - distance) / threshold + 0.64
    if(w <  0.64) w =  0.64
    if(w > 1) w = 1
    showTip.value = true
    nextTick(()=>{
      mainBtnSizeStyle.transform = `scale(${w})`
      mainBtnSizeStyle.opacity = w
      if(xOffset - startX.value > 0.4 * threshold){
        rightBtnFontStyle.transform = `scale(${2-w})`
        rightBtnFontStyle.opacity = Math.min(0.4 + 1-w,1)
      }
      if(xOffset - startX.value < -0.4 * threshold){
        leftBtnFontStyle.transform = `scale(${2-w})`
        leftBtnFontStyle.opacity = Math.min(0.4 + 1-w,1)
      }
    })

  }
};

onMounted(() => {
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
})

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

const beforeUpload = (file) => {
  // 处理文件上传逻辑
  // file to blob
  const type = file.type;
  const reader = new FileReader();
  reader.readAsArrayBuffer(file);
  reader.onload = (e) => {
    console.log(e, 'dddee')
    const blob = new Blob([e.target.result], { type: 'audio/wav' });
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    messageHistory.value.push({
      id: messageHistory.value.length + 1,
      recordTime: dayjs(new Date()).format("YYYY-MM-DD HH:mm:ss"),
      mode: '上传',
      audio: audio,
      status: MessageStatus.doing,
      content: '',
      format: asrSetting.output
    })
    const item = messageHistory.value[messageHistory.value.length - 1];
    requestWithFile(blob).then(text => {
      item.content = text;
      item.status = MessageStatus.done;
    })
  }
  return false; // 阻止组件默认上传行为
};

const requestWithFile = async (file) => {
  try {
    let formData = new FormData();
    formData.append('audio_file', file, 'temp.wav');
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
const historyAreaRef = ref<HTMLDivElement>()
const historyWrapRef = ref<HTMLDivElement>()

onMounted(async () => {
  if (isRecordingMode.value) {
    await getRecordAccess()
  }
  window.addEventListener('resize', () => {
    innerHeight.value = window.innerHeight + 'px'
  })
});

const innerHeight = ref(window.innerHeight + 'px')

</script>

<template>
  <div :style="{ height: innerHeight }">

    <div class="flex flex-col h-full z-10">
      <!-- 记录区域 -->
      <div class="h-full overflow-y-auto" ref="historyWrapRef">
        <div class="min-h-full p-4 space-y-2 bg-gray-300 flex justify-end flex-col " ref="historyAreaRef">
          <div v-for="(message, index) in messageHistory" :key="message.id" class="flex justify-end ">
            <a-card class="max-w-md w-full rounded-lg bg-blue-200"
              :class="[index === messageHistory.length - 1 ? 'z-50' : '']" :title="message.recordTime">
              <template #extra>
                <a-tag color="blue">{{ message.mode }}</a-tag>
              </template>

              <p v-if="message.status === MessageStatus.recording">录制中...</p>
              <p v-else-if="message.status === MessageStatus.doing">识别中...</p>
              <div v-else>
                <p>识别内容：{{ message.content }}</p>
                <audio controls :src="message.url"></audio>
              </div>
            </a-card>
          </div>
        </div>
      </div>
      <!-- Recording Mask -->
      <!-- 发送/上传区域 -->
      <div class="shrink-0 p-4 border-t border-gray-200 select-none h-25">
        <div v-show="isRecordingMode" class="flex justify-center items-center h-24 relative z-50">
          <!-- 录制按钮 -->
          <a-button type="primary" shape="circle" style="height: 72px;width:72px;" id="recordBtnRef"
             :style={...mainBtnSizeStyle} class="z-20">
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
        <div v-show="!isRecordingMode" class="flex justify-center">
          <!-- 文件上传 -->
          <!-- accept="audio/*,video/*" -->
          <a-upload :beforeUpload="beforeUpload" :showUploadList="false"
            accept=".webm,.opus,.oga,.wma,.flac,.weba,.m4a,.wav,.ogg,.mp3,.ogm,.wmv,.mpg,.webm,.ogv,.mov,.asx">
            <a-button style="height: 72px;margin:12px;" type="primary">
              <UploadOutlined />上传文件(音频、视频均可)
            </a-button>
          </a-upload>
        </div>
        <div class="float-right ">
          <a-button type="text" @click="switchMode">切换模式</a-button>
          <a-button type="text" @click="settingOpen = true">高级设置</a-button>
        </div>
      </div>
    </div>
    <div class="flex h-full w-full bg-slate-500 absolute top-0 left-0 z-20" v-if="isRecording">
      <div class="tip-icon left-8" :style="{...leftBtnFontStyle}">
        <LockOutlined :style="{ fontSize: '32px' }" />
      </div>
      <div class="tip-icon right-8" :style="{...rightBtnFontStyle}">
        <StopOutlined :style="{ fontSize: '32px' }" />
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
            <a-select-option v-for="format in baseData.supportedFormat" :key="format" :value="format">{{ format
            }}</a-select-option>
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
  top: calc( 50% - 36px);
  left: calc( 50% - 36px);
  animation: spread 1.5s infinite;
  animation-timing-function: ease-out;
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
  @apply absolute bottom-[4.5rem]  h-12 w-12  text-white rounded-full bg-red-300 flex items-center justify-center 
}
.tip-icon:hover{
  border:2px solid red;
}
</style>
  
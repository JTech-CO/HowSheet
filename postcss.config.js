import autoprefixer from 'autoprefixer';

// Vite가 내장 PostCSS 파이프라인으로 이 설정을 읽는다. (기술 백서 §3.1)
export default {
  plugins: [autoprefixer()],
};

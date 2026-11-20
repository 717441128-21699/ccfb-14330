import { RemasterApp } from './ui/app';
import './styles.css';

const container = document.getElementById('app');
if (!container) throw new Error('#app 根节点缺失');
new RemasterApp(container);

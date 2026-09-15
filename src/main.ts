import { TodoApp } from "./app.ts";
import { bindUi } from "./ui/bind.ts";
import "./styles.css";

const app = new TodoApp();
bindUi(document, app, { showSeedTools: import.meta.env.DEV });
void app.start();

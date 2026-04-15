import Vue from "vue";
import OptionsView from "./components/Options.vue";
import { loadI18nMessages } from "./store/i18n";
import { UserSettings } from "./models/settings";

async function init() {
  // i18n — use user-selected language if set
  await UserSettings.updateItems();
  Vue.prototype.i18n = await loadI18nMessages(
    UserSettings.items.language || undefined
  );

  new Vue({
    render: (h) => h(OptionsView),
  }).$mount("#options");
}

init();

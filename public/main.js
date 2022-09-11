/*global UIkit, Vue */

(() => {
  const notification = (config) =>
    UIkit.notification({
      pos: "top-right",
      timeout: 5000,
      ...config,
    });

  const alert = (message) =>
    notification({
      message,
      status: "danger",
    });

  const info = (message) =>
    notification({
      message,
      status: "success",
    });

  const fetchJson = (...args) =>
    fetch(...args)
      .then((res) =>
        res.ok
          ? res.status !== 204
            ? res.json()
            : null
          : res.text().then((text) => {
              throw new Error(text);
            })
      )
      .catch((err) => {
        alert(err.message);
      });

  new Vue({
    el: "#app",
    data: {
      desc: "",
      activeTimers: [],
      oldTimers: [],
    },
    methods: {
      createTimer() {
        const description = this.desc;
        this.desc = "";
        fetchJson("/api/timers", {
          method: "post",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ description }),
        }).then(({ id }) => {
          const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
          let client = new WebSocket(`${wsProto}//${location.host}`);

          client.addEventListener("message", async (message) => {
            let data;
            try {
              data = await JSON.parse(message.data);
            } catch (err) {
              return;
            }

            if (data.type === "all_timers") {
              console.log("SUS");
            }
          });
          info(`Created new timer "${description}" [${id}]`);
        });
      },
      stopTimer(id) {
        const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
        let client = new WebSocket(`${wsProto}//${location.host}`);

        client.addEventListener("message", async (message) => {
          let data;
          try {
            data = await JSON.parse(message.data);
          } catch (err) {
            return;
          }

          if (data.type === "all_timers") {
            console.log("SUS");
          }
        });
        fetchJson(`/api/timers/${id}/stop`, {
          method: "post",
        }).then(() => {
          info(`Stopped the timer [${id}]`);
        });
      },
      formatTime(ts) {
        return new Date(Number(ts)).toTimeString().split(" ")[0];
      },
      formatDuration(d) {
        d = Math.floor(Number(d) / 1000);
        const s = Number(d) % 60;
        d = Math.floor(Number(d) / 60);
        const m = Number(d) % 60;
        const h = Math.floor(Number(d) / 60);
        return [h > 0 ? h : null, m, s]
          .filter((x) => x !== null)
          .map((x) => (x < 10 ? "0" : "") + x)
          .join(":");
      },
    },
    created() {
      let client = null;
      fetch("/", {
        method: "GET",
        headers: {
          "Content-type": "application/json",
        },
      })
        .then(() => {
          const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
          client = new WebSocket(`${wsProto}//${location.host}`);

          client.addEventListener("message", async (message) => {
            let data;
            try {
              data = await JSON.parse(message.data);
            } catch (err) {
              return;
            }

            if (data.type === "all_timers") {
              const inActive = data.all_timers.filter((item) => item.isActive === false);
              this.oldTimers = inActive;
            }
          });
        })
        .catch((err) => {
          console.error(err.message);
        });

      fetch("/api/timers", {
        method: "GET",
        headers: {
          "Content-type": "application/json",
        },
      })
        .then(() => {
          const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
          client = new WebSocket(`${wsProto}//${location.host}`);

          client.addEventListener("message", async (message) => {
            let data;
            try {
              data = await JSON.parse(message.data);
            } catch (err) {
              return;
            }
            if (data.type === "active_timers") {
              this.activeTimers = data.active_timers;
            }
          });
        })
        .catch((err) => {
          console.error(err.message);
        });
    },
  });
})();

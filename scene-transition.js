(() => {
  const buttons = document.querySelectorAll(".copy-btn");

  async function copyCard(btn) {
    const card = btn.closest(".prompt-card");
    const text = card?.querySelector(".prompt-text")?.textContent ?? "";
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }

    const old = btn.textContent;
    btn.textContent = "已复制";
    btn.classList.add("done");
    window.setTimeout(() => {
      btn.textContent = old;
      btn.classList.remove("done");
    }, 1600);
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => copyCard(btn));
  });
})();

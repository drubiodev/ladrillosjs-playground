import { EVENTS } from "../../common/events.js";

let open = false;

function closeSheet()
{
    open = false;
}

$listen(EVENTS.CHEATSHEET_TOGGLE, () =>
{
    open = !open;
});

window.addEventListener("keydown", (e) =>
{
    if (e.key === "Escape" && open) open = false;
});

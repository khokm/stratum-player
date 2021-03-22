const runProject = (name, fast, path) => {
    stratum.options.iconsLocation = "../data/icons";
    const urls = [`./${name}.zip`, "../data/library.zip"];
    const promises = urls.map(url => fetch(url).then(res => res.blob()).then(stratum.unzip))
    Promise.all(promises)
    .then(async (fsArr) => {
        const fs = fsArr.reduce((a, b) => a.merge(b));
        if(document.body) document.body.innerHTML = "Подзагруажем файлы..."
        await Promise.all([...fs.files(/.+\.(bmp|vdr|dbm|txt|mat)$/i)].map((f) => f.makeSync()))
        if(document.body) document.body.innerHTML = "Загружаем ресурсы проекта..."
        return fs.project({ path, additionalClassPaths: ["library"] });
    })
    .then((prj) => {
        const cb = () => {
            prj.computer = new stratum[fast ? "FastestExecutor" : "SmoothExecutor"]();
            document.body.innerHTML = "";
            prj
            .on("closed", () => history.back())
            .on("error", (err) => alert(err))
            .play(document.body);
        }
        if(document.body) cb();
        else window.addEventListener("load", cb);
    })
    .catch((err) => {
        console.error(err);
        if(document.body) document.body.innerHTML = "Не удалось запустить проект :(";
    })
}
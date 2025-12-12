import { HTMLSelect } from "@blueprintjs/core";
import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

export default function VersionSwitcher({
  packageName = "ove",
  testBadge,
  leftComponent
}) {
  const [options, setOptions] = useState([]);
  const [version, setVersion] = useState("");
  //runs on component load
  useEffect(() => {
    (async function fetchData() {
      const res = await import(`../../${packageName}/package.json`);
      setVersion(res.version);

      try {
        if (window.Cypress) return;
        let res = await (
          await window.fetch(
            "https://api.github.com/repos/teselagen/tg-oss/git/trees/gh-pages"
          )
        ).json();
        const packageNode = res.tree.find(e => {
          return e.path.toLowerCase() === packageName;
        });
        res = await (await window.fetch(packageNode.url)).json();

        const versionNode = res.tree.find(e => {
          return e.path.toLowerCase() === "version";
        });

        res = await (await window.fetch(versionNode.url)).json();

        //set the options
        const options = res.tree.map(e => {
          return { value: e.path, label: e.path };
        });

        // sort the list so it looks nice
        options.sort((e1, e2) => {
          const e1Arr = e1.label.split(".");
          const e2Arr = e2.label.split(".");
          for (let i = 0; i < e1Arr.length && i < e2Arr.length; i++) {
            const e1V = parseInt(e1Arr[i]);
            const e2V = parseInt(e2Arr[i]);
            if (e1V !== e2V) return e2V - e1V;
            if (e1Arr[i] !== e2Arr[i]) return e2Arr[i] - e1Arr[i];
          }
          return e1.label === e2.label ? 0 : e2.label < e1.label ? -1 : 1;
        });

        setOptions(options);
      } catch (e) {
        console.error(`e:`, e);
      }
    })();
  }, ["packageName"]);

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {leftComponent}
 
    </div>
  );
}

# Introduction

Pick-Up-Stix allows you to create tokens out of items. These tokens can then be interacted with by players. Tokens can either be single items or containers that hold multiple other items and/or currency that can be looted by players.

I mainly play Dungeons and Dragons 5th and therefore I develop and test with that in mind and with the modules that I use in mind. So I apologize if it might take time to get to things sometimes. Please message me on discord @kamcknig anytime though with any quetions and I will get back when I can.


## NOTE: If you are a javascript developer and not a typescript developer, you can just use the javascript files under the dist folder builded with npm.

## Installation

It's always easiest to install modules from the in game add-on browser.

To install this module manually:
1.  Inside the Foundry "Configuration and Setup" screen, click "Add-on Modules"
2.  Click "Install Module"
3.  In the "Manifest URL" field, paste the following url:
`https://raw.githubusercontent.com/p4535992/pick-up-stix/master/src/module.json`
4.  Click 'Install' and wait for installation to complete
5.  Don't forget to enable the module in game using the "Manage Module" button

### libWrapper

This module uses the [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper) library for wrapping core methods. It is a hard dependency and it is recommended for the best experience and compatibility with other modules.

## Known Issue

- I try many times to create a new type for this , but i cannot find a way to integrate the olde code of 0.7.9 on 0.8.9, so for now all the items 'container', must be created with the preficwe 'Pick Up', case insensitive.
- Not really a issue, but Tim Posney already prepared a base for the container bag so i just reuse the sheer there is no specific container sheet for now

## Features

- Drop items from the items directory, compediums, or a player's inventory onto the canvas, player tokens, or container tokens.
- Players may pick up item tokens directly into their inventory
- Players may interact with container tokens by opening them to see a loot sheet which they can then interact with to pick up items or currency from the container.
- Create template containers by create a 'container' type item using the 'Create Item' button in the Item Directory. This template can then be dragged onto the canvas to create an instance of that container that has all of the loot configured on the container Item. You can then edit this instance of the container separtely from the one in the Item Directory.
- When interacting with a container, a selection is shown that allows players to choose which token's actor will loot the container.
- GMs may edit item and container token instances' light configuration, lock them so that players cannot interact with them, or make them invisible by opening the right click HUD on the tokens.

### New feature (version pre 2.0.0)

I have made some improvements that should hopefully speed up the module but want to point out a few changes

First off you'll notice new Item folders have been created. A parent folder named **Pick-Up-Stix** and two folders within there named **Items**, and **Tokens**. Once these folders have been created, you are free to move them around however, if you delete them as of now there is no way to recover any previous contents, though the folder should be recreated on the next startup. These folders can not be seen by players that are not GMs.

The **Tokens** folder contains Items that represent any loot token instances that are in a scene. If you edit one of them from the Items directory, then you will edit all loot token instances attached to it. If you want to create another instance, simply drag one of the Items from the **Tokens** Item folder and you'll have a copy of that Item that will update when it updates. If you delete an Item from the **Tokens** folder, then all loot token instances will be removed from all scenes. If you delete all loot token instances from all scenes, the Item associated with it in the **Tokens** folder will also be deleted

The **Items** folder is a template folder. When you create an Item and choose the 'container' type, you'll get an Item created in the **Items** folder. If you drag one of these onto the canvas, you'll create a new loot token based on the properties of that Item, but you'll notice that a new Item is created in the **Tokens** folder. You can updated this new loot token by either updating it's new corresponding Item or through the token's config menu. You can also update that token and then drag a copy of it from the **Tokens** folder NOT the **Items** folder to create a new loot token with the udpated properties. Items in the **Items** folder are not deleted when any loot tokens created from them are deleted, nor are any loot tokens deleted when any Items in the **Items** directory are removed. Currently, only container-type Items are treated as templates since item-type Items are already their own templates.

## Limitations

- Only one player at a time may interact with a container. This is due to the complicated nature of syncing the data between clients and the limitations of Foundry at the current time.
- You might notice a slight delay when looting items, usually this is no more than a couple hundred milliseconds or less. This again is due to the nature of syncing the data across all clients.
- Currently, to interact with an item or container token, a player's token must be within one square of the token.
- Container/item tokens cannot be copied/pasted

## Future Considrations and Plans

- Using roll tables to fill loot container
- Loot dead bodies
- Steal from living bodies using DC checks and notifications to GM if it fails
- Allowing addition of items via the 'add' button on the item config application
- Lots more, my backlog and suggestions I've received from people has filled my Trello board

## Known Issues

- Editing currency of a container template in the Item Directory does not visually show the currency in the config sheet after saving. Once you drag that template to the canvas, the token instance should have the currency though, or you can also edit the token instance's currency and that works correctly and as expected.
- The numerical inputs on the container's config should support the +/- form to add/subtract quantities, but is currently broken.

# Demo

Click to see the demo!

[![Demo thumbnail](https://turkeysunite-foundry-modules.s3.amazonaws.com/pick-up-stix/demos/pick-up-stix-demo-thumb.png)](https://turkeysunite-foundry-modules.s3.amazonaws.com/pick-up-stix/demos/pick-up-stix-demo.mp4 "Click to watch the demo video!")

# Build

## Install all packages

```bash
npm install
```
## npm build scripts
### build

will build the code and copy all necessary assets into the dist folder and make a symlink to install the result into your foundry data; create a
`foundryconfig.json` file with your Foundry Data path.

```json
{
  "dataPath": "~/.local/share/FoundryVTT/"
}
```

`build` will build and set up a symlink between `dist` and your `dataPath`.

```bash
npm run-script build
```

### NOTE:

You don't need to build the `foundryconfig.json` file you can just copy the content of the `dist` folder on the module folder under `modules` of Foundry

### build:watch

`build:watch` will build and watch for changes, rebuilding automatically.

```bash
npm run-script build:watch
```

### clean

`clean` will remove all contents in the dist folder (but keeps the link from build:install).

```bash
npm run-script clean
```
### lint and lintfix

`lint` launch the eslint process based on the configuration [here](./.eslintrc)

```bash
npm run-script lint
```

`lintfix` launch the eslint process with the fix argument

```bash
npm run-script lintfix
```

### prettier-format

`prettier-format` launch the prettier plugin based on the configuration [here](./.prettierrc)

```bash
npm run-script prettier-format
```

### package

`package` generates a zip file containing the contents of the dist folder generated previously with the `build` command. Useful for those who want to manually load the module or want to create their own release

```bash
npm run-script package
```

## [Changelog](./changelog.md)

## Issues

Any issues, bugs, or feature requests are always welcome to be reported directly to the [Issue Tracker](https://github.com/kamcknig/pick-up-stix/issues ), or using the [Bug Reporter Module](https://foundryvtt.com/packages/bug-reporter/).

## License

This package is under an [MIT license](LICENSE) and the [Foundry Virtual Tabletop Limited License Agreement for module development](https://foundryvtt.com/article/license/).

## Acknowledgements

Bootstrapped with League of Extraordinary FoundryVTT Developers  [foundry-vtt-types](https://github.com/League-of-Foundry-Developers/foundry-vtt-types).

Mad props to the 'League of Extraordinary FoundryVTT Developers' community which helped me figure out a lot.

## Credit

Thanks to anyone who helps me with this code! I appreciate the user community's feedback on this project!

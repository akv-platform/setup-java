import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import * as httpm from '@actions/http-client';

import path from 'path';
import fs from 'fs';
import semver from 'semver';

import { BaseFactory, IJavaInfo, JavaBase } from './base-installer';
import { IZulu, IZuluDetailed } from './zulu-models';
import { IS_WINDOWS, IS_MACOS, PLATFORM } from '../util';
import { JavaInitOptions } from '../installer';

export class ZuluDistributor extends JavaBase {
    private extension = IS_WINDOWS ? 'zip' : 'tar.gz';
    private platform: string;
    constructor(initOptions: JavaInitOptions) {
        super("Azul Systems, Inc.", version, arch, javaPackage);
        this.platform = IS_MACOS ? 'macos' : PLATFORM;
    }

    protected async getAvailableMajor(range: semver.Range) {
        const url = `https://api.azul.com/zulu/download/community/v1.0/bundles/?os=${this.platform}&arch=${this.arch}&hw_bitness=64&ext=${this.extension}&bundle_type=${this.javaPackage}`;
        const zuluJavaJson = (await this.http.getJson<Array<IZulu>>(url)).result;
        if(!zuluJavaJson) {
            throw new Error(`No zulu java was found for all`);
        }

        core.info(`url is ${url}`);
        core.info(`range is ${range}`);
        const javaVersions = zuluJavaJson.map(item => semver.coerce(item.jdk_version.join('.'))!);
        const majorVersion = semver.maxSatisfying(javaVersions, range);

        if(!majorVersion) {
            throw new Error(`No zulu major versions was found`);
        }

        return majorVersion.major;
    }

    protected async downloadTool(range: semver.Range): Promise<IJavaInfo> {
        let toolPath: string;

        const javaVersion = await this.getJavaVersion(this.http, range);
        const url = `https://api.azul.com/zulu/download/community/v1.0/bundles/latest/?ext=${this.extension}&os=${this.platform}&arch=${this.arch}&hw_bitness=64&jdk_version=${javaVersion}&bundle_type=${this.javaPackage}`;
        const zuluJavaJson = (await this.http.getJson<IZuluDetailed>(url)).result;
        core.debug(`url for initilial download tool is ${url}`);
        core.debug(`zuluJavaJson for initilial download tool is ${zuluJavaJson}`);

        if(!zuluJavaJson) {
            throw new Error(`No zulu java was found for version ${javaVersion}`);
        }

        core.info(`Downloading ${this.distributor} java version ${javaVersion}`);
        core.info(`Zulu url is ${zuluJavaJson.url}`);
        const javaPath = await tc.downloadTool(zuluJavaJson.url);
        let downloadDir: string;
        
        core.info(`Ectracting ${this.distributor} java version ${javaVersion}`);
        if(IS_WINDOWS) {
            downloadDir = await tc.extractZip(javaPath);
        } else {
            downloadDir = await tc.extractTar(javaPath);
        }

        const archiveName = fs.readdirSync(downloadDir)[0];
        const archivePath = path.join(downloadDir, archiveName);
        toolPath = await tc.cacheDir(archivePath, `Java_${this.distributor.replace(' ', '')}_${this.javaPackage}`, javaVersion, this.arch);

        return { javaPath: toolPath, javaVersion };
    }

    private async getJavaVersion(http: httpm.HttpClient, range: semver.Range): Promise<string> {
        const url = `https://api.azul.com/zulu/download/community/v1.0/bundles/?ext=${this.extension}&os=${this.platform}&arch=${this.arch}&hw_bitness=64`;

        core.debug(`url get all java versions: ${url}`);
        const zuluJson = (await http.getJson<Array<IZulu>>(url)).result;

        if(!zuluJson || zuluJson.length === 0) {
            throw new Error(`No Zulu java versions were not found for arch ${this.arch}, extenstion ${this.extension}, platform ${this.platform}`);
        }
        core.debug(`get id: ${zuluJson[0].id}`);

        core.debug('Get the list of zulu java versions');
        const zuluVersions = zuluJson.map(item => semver.coerce(item.jdk_version.join('.'))?? "");
        const maxVersion = semver.maxSatisfying(zuluVersions, range);

        if(!maxVersion) {
            throw new Error('No versions are satisfying');
        }

        return maxVersion.raw;
    }
    
}
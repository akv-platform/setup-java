import * as tc from '@actions/tool-cache';
import * as core from '@actions/core';
import semver from 'semver';
import path from 'path';
import * as httpm from '@actions/http-client';
import { getVersionFromToolcachePath } from '../util';

export interface JavaInstallerOptions {
    version: string;
    arch: string;
    javaPackage: string;
}

export interface JavaInstallerResults {
    javaVersion: string;
    javaPath: string;
}

export interface IJavaRelease {
    resolvedVersion: string;
    link: string;
}

export abstract class JavaBase {
    protected http: httpm.HttpClient;
    protected version: string;
    protected arch: string;
    protected javaPackage: string;
    constructor(protected distributor: string, initOptions: JavaInstallerOptions) {
        this.http = new httpm.HttpClient('setup-java', undefined, {
            allowRetries: true,
            maxRetries: 3
          });
          this.version = this.normalizeVersion(initOptions.version);
          this.arch = initOptions.arch;
          this.javaPackage  = initOptions.javaPackage;
    }

    protected abstract downloadTool(javaRelease: IJavaRelease): Promise<JavaInstallerResults>;
    protected abstract findPackageForDownload(range: semver.Range): Promise<IJavaRelease>;

    public async setupJava(): Promise<JavaInstallerResults> {
        const range = new semver.Range(this.version);
        let foundJava = this.findInToolcache(range);

        if(!foundJava) {
            const javaRelease = await this.findPackageForDownload(range)
            foundJava = await this.downloadTool(javaRelease);
        }

        this.setJavaDefault(foundJava.javaPath, foundJava.javaVersion);

        return foundJava;
    }

    protected get toolcacheFolderName(): string {
        return `Java_${this.distributor}_${this.javaPackage}`;
    }

    protected findInToolcache(version: semver.Range): JavaInstallerResults | null {
        const toolPath = tc.find(this.toolcacheFolderName, version.raw, this.arch);
        if (!toolPath) {
            return null;
        }

        return {
            javaVersion: getVersionFromToolcachePath(toolPath),
            javaPath: toolPath
        };
    }

    protected setJavaDefault(toolPath: string, version: string) {
        core.exportVariable('JAVA_HOME', toolPath);
        core.addPath(path.join(toolPath, 'bin'));
        core.setOutput('path', toolPath);
        core.setOutput('version', version);
    }

    // this function validates and parse java version to its normal semver notation
    protected normalizeVersion(version: string): string {
        if (version.startsWith('1.')) {
          // Trim leading 1. for versions like 1.8
          version = version.slice(2);
          if (!version) {
            throw new Error('1. is not a valid version');
          }
        }
    
        if (version.endsWith('-ea')) {
          // convert e.g. 14-ea to 14.0.0-ea
          if (version.indexOf('.') == -1) {
            version = version.slice(0, version.length - 3) + '.0.0-ea';
          }
          // match anything in -ea.X (semver won't do .x matching on pre-release versions)
          if (version[0] >= '0' && version[0] <= '9') {
            version = '>=' + version;
          }
        } else if (version.split('.').length < 3) {
          // For non-ea versions, add trailing .x if it is missing
          if (version[version.length - 1] != 'x') {
            version = version + '.x';
          }
        }
    
        if (!semver.validRange(version)) {
          throw new Error(`The version ${version} is not valid semver notation please check README file for code snippets and 
                      more detailed information`);
        }
    
        return version;
    }
}
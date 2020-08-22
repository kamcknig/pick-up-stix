pipeline {
    agent any

    parameters {
        string(name: 'VERSION', description: 'Version to publish')
    }

    stages {
        stage("CLONE") {
            echo "======== executing CLONE ==========="
            git credentialsId: 'git-kamcknig', branch: '${env.TAG}', poll: false, url: 'https://github.com/kamcknig/pick-up-stix'
        }
        stage("BUILD") {
            steps {
                echo "======== executing BUILD ========"
                sh 'npm ci'
                sh 'npm run build'
                sh 'npm run package'
            }
            post{
                always {
                    echo "======== always ========"
                }
                success {
                    echo "======== A executed successfully ========"
                }
                failure {
                    echo "======== A execution failed ========"
                }
            }
        }
        stage("UPLOAD") {
            steps {
                withAWS(credentials: "jenkins-s3-publisher") {
                    s3Upload(bucket:"turkeysunite-foundry-modules", path:"pick-up-stix/releases/", includePathPattern:'**/*.zip', workingDir:"package", acl: "PublicRead")
                }
            }
            post {
                success {
                    echo "======== Publish to S3 Success ========"
                }
                failure {
                    echo "======== Failed to upload to S3 =========="
                }
            }
        }
    }
}
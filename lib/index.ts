// import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export interface SqsSfnDispatcherProps {
  // Define construct properties here
}

export class SqsSfnDispatcher extends Construct {

  constructor(scope: Construct, id: string, props: SqsSfnDispatcherProps = {}) {
    super(scope, id);

    // Define construct contents here

    // example resource
    // const queue = new sqs.Queue(this, 'SqsSfnDispatcherQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });
  }
}

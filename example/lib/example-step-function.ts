import { Construct } from "constructs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";

/**
 * Step function that succeeds when input value is even and fails when input value is odd.
 */
export class ExampleStepFunction extends Construct {
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const checkEven = new sfn.Choice(this, "CheckEven", {
      queryLanguage: sfn.QueryLanguage.JSONATA,
    })
      .when(
        sfn.Condition.jsonata("{% $states.input.number % 2 = 0 %}"),
        new sfn.Succeed(this, "Succeed")
      )
      .otherwise(new sfn.Fail(this, "Fail"));

    const stateMachine = new sfn.StateMachine(this, "StateMachine", {
      definitionBody: sfn.DefinitionBody.fromChainable(checkEven),
    });
    this.stateMachine = stateMachine;
  }
}
